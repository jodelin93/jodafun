import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSessionUser, type SessionUser } from '../auth/session';
import { RoomStore, type Difficulty, type GameRoom, type Player } from './room-store';
import { RateLimiter, dealDeck, generateRoomCode, normalizeRoomCode } from './game.utils';
import { PresenceState, presenceName, type PresenceEntry } from './presence';

// Pairs dealt per difficulty; a deck must contain exactly twice this many cards
export const PAIRS_BY_DIFFICULTY = { easy: 4, medium: 8, hard: 12 } as const;
const ROUND_WINS_TO_WIN_GAME = 4;
// Socket ids from a previous process are prefixed so no live socket can match them
const STALE_SOCKET_PREFIX = 'stale:';
const TOO_MANY_REQUESTS = { success: false, error: 'Too many requests' };
const PRESENCE_LIST_MAX = 50;
const PRESENCE_EMIT_INTERVAL_MS = 1000;

const isDifficulty = (value: unknown): value is Difficulty =>
  value === 'easy' || value === 'medium' || value === 'hard';

// How long a disconnected player keeps their seat before being removed
const graceMs = (gameInProgress: boolean) =>
  gameInProgress
    ? Number(process.env.ROOM_GRACE_GAME_MS) || 60_000
    : Number(process.env.ROOM_GRACE_LOBBY_MS) || 5 * 60_000;

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class GameGateway implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Session user per socket, resolved from the session cookie on connect (null = anonymous)
  private socketUsers: Map<string, Promise<SessionUser | null>> = new Map();
  // Removal timers for disconnected players in their grace period
  private graceTimers: Map<Player, NodeJS.Timeout> = new Map();
  private flipLimiter = new RateLimiter(10, 1000);
  private joinLimiter = new RateLimiter(20, 60_000);
  private inviteLimiter = new RateLimiter(10, 60_000);
  private presence = new PresenceState();
  // Trailing throttle for presence:changed
  private presenceTimer: NodeJS.Timeout | null = null;
  private lastPresenceEmitAt = 0;
  private lastPresenceSignature = '';

  constructor(
    private prisma: PrismaService,
    private rooms: RoomStore,
  ) {}

  // Rooms persisted by a previous process come back with every player disconnected
  async onModuleInit() {
    let restored: GameRoom[];
    try {
      restored = await this.rooms.loadAll();
    } catch (error) {
      console.error('Failed to restore rooms from Redis:', error);
      return;
    }

    const now = Date.now();
    for (const room of restored) {
      this.adoptRoom(room, now);
    }
    if (this.rooms.durable) {
      console.log(`Restored ${restored.length} room(s) from Redis`);
    }
  }

  // Takes over a room written by another process: its sockets are not ours, so every
  // player is disconnected (stale socket ids) until they rejoin within the grace period
  private adoptRoom(room: GameRoom, now: number) {
    if (room.players.length === 0) {
      this.rooms.delete(room.id);
      return;
    }
    for (const player of room.players) {
      if (!player.socketId.startsWith(STALE_SOCKET_PREFIX)) {
        const staleId = STALE_SOCKET_PREFIX + player.socketId;
        if (room.hostId === player.socketId) room.hostId = staleId;
        player.socketId = staleId;
      }
      if (player.connected) {
        player.connected = false;
        player.disconnectedAt = now;
      }
    }
    this.rooms.save(room);
    room.players.forEach(player => this.startGraceTimer(room, player));
  }

  // During a deploy the previous process may still write rooms after this one booted.
  // When nobody is connected to a room here, prefer a newer copy from Redis.
  private async latestRoom(roomId: string): Promise<GameRoom | undefined> {
    const cached = this.rooms.get(roomId);
    if (!this.rooms.durable || cached?.players.some(p => p.connected)) return cached;
    const stored = await this.rooms.fetch(roomId).catch(error => {
      console.error(`Failed to read room ${roomId} from Redis:`, error);
      return null;
    });
    if (!stored || (cached && stored.updatedAt <= cached.updatedAt)) return cached;
    cached?.players.forEach(player => this.clearGraceTimer(player));
    this.adoptRoom(stored, Date.now());
    // The adopted copy may hold seats that unlist someone
    this.schedulePresenceChanged();
    return this.rooms.get(roomId);
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.socketUsers.set(
      client.id,
      resolveSessionUser(this.prisma, client.handshake.headers.cookie)
        .catch(error => {
          console.error(`Session lookup failed for ${client.id}:`, error);
          return null;
        }),
    );
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.socketUsers.delete(client.id);
    this.flipLimiter.forget(client.id);
    this.joinLimiter.forget(client.id);
    this.inviteLimiter.forget(client.id);
    this.presence.available.delete(client.id);
    this.clearInvitesOf(client.id);

    // Keep the seat for a grace period so the player can rejoin from a new socket
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === client.id);
      if (!player) continue;

      player.connected = false;
      player.disconnectedAt = Date.now();
      this.server.to(room.id).emit('playerDisconnected', {
        playerId: player.id,
        playerName: player.name,
        players: this.publicPlayers(room),
      });

      this.startGraceTimer(room, player);
      this.rooms.save(room);
    }
    this.schedulePresenceChanged();
  }

  @SubscribeMessage('rejoinRoom')
  async handleRejoinRoom(
    @MessageBody() data: { roomId: string; playerKey: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.joinLimiter.allow(client.id)) return TOO_MANY_REQUESTS;
    const roomId = normalizeRoomCode(data?.roomId);
    const room = await this.latestRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const userId = await this.getSocketUserId(client.id);
    const player = this.findOwnSeat(room, data.playerKey, userId);
    if (!player) {
      return { success: false, error: 'Seat not found' };
    }

    return this.reclaimSeat(room, player, client, userId);
  }

  // A player's own seat in this room: same tab (playerKey), or a dropped seat of the same signed-in user (new tab/window)
  private findOwnSeat(room: GameRoom, playerKey: unknown, userId: string | null): Player | undefined {
    if (typeof playerKey === 'string' && playerKey) {
      const byKey = room.players.find(p => p.playerKey === playerKey);
      if (byKey) return byKey;
    }
    return userId ? room.players.find(p => p.userId === userId && !p.connected) : undefined;
  }

  // Move a held seat onto the caller's socket and return the room plus, mid-game, the board to resync from
  private reclaimSeat(room: GameRoom, player: Player, client: Socket, userId: string | null, playerKey?: unknown) {
    const roomId = room.id;
    this.clearGraceTimer(player);

    // If the old socket is somehow still alive, stop it receiving this room's events
    if (player.socketId !== client.id) {
      this.server.in(player.socketId).socketsLeave(roomId);
    }
    if (room.hostId === player.socketId) {
      room.hostId = client.id;
    }
    player.socketId = client.id;
    player.connected = true;
    player.disconnectedAt = null;
    player.userId = userId;
    if (typeof playerKey === 'string' && playerKey) player.playerKey = playerKey;
    client.join(roomId);
    this.rooms.save(room);
    this.onSeated(client.id);

    this.server.to(roomId).emit('playerReconnected', {
      playerId: player.id,
      playerName: player.name,
      players: this.publicPlayers(room),
    });

    console.log(`Player ${player.name} rejoined room ${roomId}`);

    return {
      success: true,
      rejoined: true,
      room: {
        id: room.id,
        players: this.publicPlayers(room),
        difficulty: room.difficulty,
        showOpponentMoves: room.showOpponentMoves,
        gameStarted: room.gameStarted,
        pausedById: room.pausedBy ?? null,
        pausedByName: room.players.find(p => p.id === room.pausedBy)?.name ?? null,
      },
      game:
        room.gameStarted && room.cards.length > 0
          ? {
              cards: room.cards.map(c => ({ iconName: c.iconName })),
              matched: [...room.matchedCards],
              flipped: [...room.flippedCards],
              currentPlayerIndex: room.currentPlayerIndex,
              pairs: [...room.roundPairs],
              roundWins: [...room.roundWins],
              currentRound: room.currentRound,
            }
          : null,
    };
  }

  @SubscribeMessage('createGame')
  async handleCreateGame(
    @MessageBody()
    data: { playerName: string; difficulty: Difficulty; playerKey?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.joinLimiter.allow(client.id)) return TOO_MANY_REQUESTS;
    const difficulty = isDifficulty(data?.difficulty) ? data.difficulty : 'easy';
    const userId = await this.getSocketUserId(client.id);
    const room = this.openRoom(client, data.playerName, userId, data.playerKey, difficulty);
    const roomId = room.id;

    console.log(`Game created: ${roomId} by ${data.playerName}`);

    return {
      success: true,
      roomId,
      room: this.sanitizeRoom(room),
    };
  }

  // Creates a room with the given socket as host (createGame and accepted requests)
  private openRoom(
    hostSocket: Socket,
    name: string,
    userId: string | null,
    playerKey: unknown,
    difficulty: Difficulty,
  ): GameRoom {
    const roomId = generateRoomCode(code => this.rooms.has(code));
    const now = Date.now();
    const room: GameRoom = {
      id: roomId,
      hostId: hostSocket.id,
      players: [this.newPlayer(hostSocket.id, name, userId, playerKey, true)],
      difficulty,
      gameStarted: false,
      currentPlayerIndex: 0,
      cards: [],
      flippedCards: [],
      currentRound: 1,
      roundWins: [0, 0],
      showOpponentMoves: true, // Default to showing moves
      gameActive: false,
      roundActive: false,
      gameHasFlips: false,
      matchedCards: [],
      roundPairs: [0, 0],
      totalPairs: [0, 0],
      gameDifficulty: difficulty,
      gameStartedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.save(room);
    hostSocket.join(roomId);
    this.onSeated(hostSocket.id);
    return room;
  }

  private newPlayer(socketId: string, name: string, userId: string | null, playerKey: unknown, isHost: boolean): Player {
    return {
      id: socketId,
      name,
      score: 0,
      isHost,
      isReady: false,
      socketId,
      userId,
      playerKey: typeof playerKey === 'string' && playerKey ? playerKey : undefined,
      connected: true,
      disconnectedAt: null,
    };
  }

  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @MessageBody() data: { roomId: string; playerName: string; playerKey?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.joinLimiter.allow(client.id)) return TOO_MANY_REQUESTS;
    const userId = await this.getSocketUserId(client.id);
    const roomId = normalizeRoomCode(data?.roomId);
    const room = await this.latestRoom(roomId);

    if (!room) {
      return {
        success: false,
        error: 'Game room not found',
      };
    }

    // Reloading the page or reopening the link must not lock someone out of the seat being held for them
    const ownSeat = this.findOwnSeat(room, data.playerKey, userId);
    if (ownSeat) {
      return this.reclaimSeat(room, ownSeat, client, userId, data.playerKey);
    }

    if (room.players.length >= 2) {
      return {
        success: false,
        error: 'This room is full. The link has expired.',
      };
    }

    if (room.gameStarted) {
      return {
        success: false,
        error: 'Game has already started',
      };
    }

    const player = this.newPlayer(client.id, data.playerName, userId, data.playerKey, false);

    room.players.push(player);
    this.rooms.save(room);
    client.join(roomId);
    this.onSeated(client.id);

    // Notify all players in the room
    this.server.to(roomId).emit('playerJoined', {
      player: this.publicPlayer(player),
      players: this.publicPlayers(room),
    });

    console.log(`${data.playerName} joined game: ${roomId}`);

    return {
      success: true,
      room: this.sanitizeRoom(room),
    };
  }

  @SubscribeMessage('playerReady')
  handlePlayerReady(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.find(p => p.socketId === client.id);
    if (player) {
      player.isReady = true;
      this.rooms.save(room);

      // Notify all players
      this.server.to(roomId).emit('playerReadyUpdate', {
        playerId: client.id,
        players: this.publicPlayers(room),
      });

      // Check if all players are ready
      const allReady = room.players.every(p => p.isReady) && room.players.length === 2;
      if (allReady) {
        this.server.to(roomId).emit('allPlayersReady', {
          message: 'All players ready! Starting game...',
        });
      }

      return { success: true, allReady };
    }

    return { success: false, error: 'Player not found' };
  }

  @SubscribeMessage('startGame')
  handleStartGame(
    @MessageBody() data: { roomId: string; difficulty?: Difficulty; cards?: any[] },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.hostId !== client.id) {
      return { success: false, error: 'Only host can start the game' };
    }

    // New cards only between rounds: re-dealing mid-round would let the player who is behind wipe the board
    if (room.roundActive) {
      return { success: false, error: 'Round in progress' };
    }
    room.pausedBy = null;

    // The server always deals; an older client's deck only tells us its size
    const difficulty = isDifficulty(data?.difficulty)
      ? data.difficulty
      : (this.getDeckDifficulty(data?.cards) ?? room.difficulty);

    if (room.gameActive) {
      // Every deal after the first one in the same game is a new round
      room.currentRound += 1;
    } else {
      room.gameActive = true;
      room.gameHasFlips = false;
      room.currentRound = 1;
      room.roundWins = [0, 0];
      room.totalPairs = [0, 0];
      room.gameDifficulty = difficulty;
      room.gameStartedAt = new Date();
    }

    room.gameStarted = true;
    room.cards = dealDeck(PAIRS_BY_DIFFICULTY[difficulty]);
    room.currentPlayerIndex = 0;
    room.flippedCards = [];
    room.matchedCards = [];
    room.roundPairs = [0, 0];
    room.roundActive = true;

    // Reset scores
    room.players.forEach(p => {
      p.score = 0;
    });
    this.rooms.save(room);

    this.server.to(roomId).emit('gameStarted', {
      cards: room.cards,
      currentPlayerIndex: room.currentPlayerIndex,
      players: this.publicPlayers(room),
      difficulty,
    });

    return { success: true };
  }

  @SubscribeMessage('toggleOpponentMoves')
  handleToggleOpponentMoves(
    @MessageBody() data: { roomId: string; showOpponentMoves: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Only host can change this setting
    if (client.id !== room.hostId) {
      return { success: false, error: 'Only host can change visibility settings' };
    }

    // Update the setting
    room.showOpponentMoves = data.showOpponentMoves;
    this.rooms.save(room);

    // Broadcast the change to all players in the lobby
    this.server.to(roomId).emit('visibilityChanged', {
      showOpponentMoves: room.showOpponentMoves,
    });

    return { success: true };
  }

  @SubscribeMessage('togglePause')
  handleTogglePause(
    @MessageBody() data: { roomId: string; paused: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.find(p => p.socketId === client.id);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const paused = Boolean(data?.paused);
    if (paused) {
      if (!room.gameStarted) {
        return { success: false, error: 'No game in progress' };
      }
      if (room.pausedBy && room.pausedBy !== player.id) {
        return { success: false, error: 'Already paused' };
      }
      room.pausedBy = player.id;
    } else {
      if (!room.pausedBy) {
        return { success: true };
      }
      // Only the player who paused can resume, so nobody gets pulled back into a game they stopped
      if (room.pausedBy !== player.id) {
        return { success: false, error: 'Only the player who paused can resume' };
      }
      room.pausedBy = null;
    }
    this.rooms.save(room);

    this.server.to(roomId).emit('gamePaused', {
      paused,
      pausedBy: client.id,
      pausedById: player.id,
      pausedByName: player.name,
    });

    return { success: true };
  }

  @SubscribeMessage('sendChatMessage')
  handleChatMessage(
    @MessageBody() data: { roomId: string; message: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Find the sender's player info
    const sender = room.players.find(p => p.socketId === client.id);

    if (!sender) {
      return { success: false, error: 'Player not found' };
    }

    // Broadcast the message to all players in the room
    this.server.to(roomId).emit('chatMessage', {
      playerName: sender.name,
      playerId: client.id,
      message: data.message,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }

  @SubscribeMessage('cardFlipped')
  handleCardFlipped(
    @MessageBody() data: { roomId: string; cardId: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.flipLimiter.allow(client.id)) return TOO_MANY_REQUESTS;
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.pausedBy) {
      return { success: false, error: 'Game paused' };
    }

    const playerIndex = room.players.findIndex(p => p.socketId === client.id);
    if (!room.roundActive || playerIndex === -1 || playerIndex !== room.currentPlayerIndex) {
      return { success: false, error: 'Not your turn' };
    }

    const cardId = data.cardId;
    if (
      !Number.isInteger(cardId) ||
      cardId < 0 ||
      cardId >= room.cards.length ||
      room.matchedCards.includes(cardId) ||
      room.flippedCards.includes(cardId) ||
      room.flippedCards.length >= 2
    ) {
      return { success: false, error: 'Invalid card' };
    }

    room.flippedCards.push(cardId);
    room.gameHasFlips = true;

    // Broadcast to all players in the room
    this.server.to(roomId).emit('cardFlipped', {
      cardId: data.cardId,
      playerId: client.id,
    });

    if (room.flippedCards.length === 2) {
      const [firstId, secondId] = room.flippedCards;
      if (room.cards[firstId].iconName === room.cards[secondId].iconName) {
        // Match: the player scores a pair and keeps the turn
        room.matchedCards.push(firstId, secondId);
        room.roundPairs[playerIndex] += 1;
        room.totalPairs[playerIndex] += 1;
      } else {
        room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
      }
      room.flippedCards = [];

      if (room.matchedCards.length === room.cards.length) {
        this.endRound(room);
      }
    }
    this.rooms.save(room);

    return { success: true };
  }

  @SubscribeMessage('matchFound')
  handleMatchFound(
    @MessageBody() data: { roomId: string; cardIds: number[] },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const playerIndex = room.players.findIndex(p => p.socketId === client.id);
    if (playerIndex !== -1) {
      room.players[playerIndex].score += 1;
      this.rooms.save(room);
    }

    this.server.to(roomId).emit('matchFound', {
      cardIds: data.cardIds,
      playerId: client.id,
      players: this.publicPlayers(room),
    });

    return { success: true };
  }

  @SubscribeMessage('noMatch')
  handleNoMatch(
    @MessageBody() data: { roomId: string; cardIds: number[] },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Switch turn
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    this.rooms.save(room);

    this.server.to(roomId).emit('noMatch', {
      cardIds: data.cardIds,
      currentPlayerIndex: room.currentPlayerIndex,
    });

    return { success: true };
  }

  @SubscribeMessage('gameWon')
  handleGameWon(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    this.server.to(roomId).emit('gameWon', {
      players: this.publicPlayers(room),
    });

    return { success: true };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = normalizeRoomCode(data?.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Leave the socket room, then remove the player and notify the others
    client.leave(roomId);
    this.removePlayer(roomId, room, client.id);

    return { success: true };
  }

  // Shared by leaveRoom and the grace timer
  private removePlayer(roomId: string, room: GameRoom, socketId: string) {
    room.pausedBy = null;
    const playerIndex = room.players.findIndex(p => p.socketId === socketId);
    if (playerIndex === -1) return;

    const leavingPlayer = room.players[playerIndex];
    this.clearGraceTimer(leavingPlayer);
    const gameInProgress = room.gameStarted && room.gameActive;

    // Leaving an active game after the first flip forfeits it to the player who stayed.
    // If both are gone, the one who disconnected later counts as having stayed.
    let winner: Player | null = null;
    if (gameInProgress && room.gameHasFlips && room.players.length === 2) {
      const other = room.players[playerIndex === 0 ? 1 : 0];
      const leftAt = leavingPlayer.disconnectedAt ?? Date.now();
      if (other.connected || (other.disconnectedAt ?? 0) > leftAt) winner = other;
    }
    if (winner) {
      const startedAt = room.gameStartedAt ?? new Date();
      this.saveGameResult(
        [...room.players],
        playerIndex === 0 ? 1 : 0,
        [...room.roundWins],
        [...room.totalPairs],
        room.gameDifficulty,
        startedAt,
        room.currentRound,
        true,
      ).catch(error => console.error(`Failed to save forfeit for room ${roomId}:`, error));
    }

    room.players.splice(playerIndex, 1);

    // The game is over either way and the room goes back to the lobby
    if (room.gameStarted) {
      this.resetGameState(room);
      room.gameStarted = false;
      room.cards = [];
      room.players.forEach(p => {
        p.isReady = false;
        p.score = 0;
      });
    }

    // Notify remaining players
    this.server.to(roomId).emit('playerLeft', {
      playerId: leavingPlayer.id,
      playerName: leavingPlayer.name,
      players: this.publicPlayers(room),
      gameInProgress,
      forfeit: winner !== null,
      winnerId: winner?.id ?? null,
    });

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      if (leavingPlayer.isHost) {
        // If host left, assign new host
        room.players[0].isHost = true;
        room.hostId = room.players[0].socketId;
        this.server.to(roomId).emit('newHost', {
          hostId: room.players[0].socketId,
          players: this.publicPlayers(room),
        });
      }
      this.rooms.save(room);
    }

    console.log(`Player ${leavingPlayer.name} left room ${roomId}`);
    // Freeing a seat can make its owner listed again
    this.schedulePresenceChanged();
  }

  @SubscribeMessage('presence:update')
  async handlePresenceUpdate(
    @MessageBody() data: { available: boolean; name?: string; playerKey?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = await this.getSocketUser(client.id);
    // The socket may have disconnected while the session lookup was pending
    if (!client.connected) return { success: true };

    if (data?.available === true) {
      const existing = this.presence.available.get(client.id);
      this.presence.available.set(client.id, {
        socketId: client.id,
        name: presenceName(data.name, user?.name),
        playerKey: typeof data.playerKey === 'string' && data.playerKey ? data.playerKey : existing?.playerKey,
        userId: user?.id ?? null,
        isGuest: user ? user.isGuest : true,
        since: existing?.since ?? Date.now(),
      });
    } else {
      this.presence.available.delete(client.id);
    }
    this.schedulePresenceChanged();
    return { success: true };
  }

  @SubscribeMessage('presence:list')
  async handlePresenceList(@ConnectedSocket() client: Socket) {
    const userId = await this.getSocketUserId(client.id);
    const players = this.listedPlayers()
      .filter(e => e.socketId !== client.id && !(userId && e.userId === userId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, PRESENCE_LIST_MAX)
      .map(e => ({ id: e.socketId, name: e.name, isGuest: e.isGuest, since: e.since }));
    return { players };
  }

  @SubscribeMessage('invite:send')
  async handleInviteSend(
    @MessageBody() data: { toId: string; playerKey: string; difficulty?: Difficulty },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.inviteLimiter.allow(client.id)) return TOO_MANY_REQUESTS;
    const user = await this.getSocketUser(client.id);
    if (!client.connected) return { success: false, error: 'Player not available' };

    const target = this.listedPlayers().find(e => e.socketId === data?.toId);
    if (!target || target.socketId === client.id || (user && target.userId === user.id)) {
      return { success: false, error: 'Player not available' };
    }
    // Accepting would fail anyway: a seated socket cannot be put in a new room
    if (this.isSeated(client.id)) {
      return { success: false, error: 'You are already in a room' };
    }
    if (this.presence.outgoing(client.id)) {
      return { success: false, error: 'You already have a pending request' };
    }
    if (this.presence.incoming(target.socketId)) {
      return { success: false, error: 'They already have a request' };
    }

    const invite = this.presence.addInvite(
      client.id,
      target.socketId,
      typeof data.playerKey === 'string' && data.playerKey ? data.playerKey : undefined,
      isDifficulty(data.difficulty) ? data.difficulty : 'medium',
      expired => {
        this.server.to(expired.fromId).emit('invite:expired', { inviteId: expired.id });
        this.server.to(expired.toId).emit('invite:expired', { inviteId: expired.id });
      },
    );
    this.server.to(target.socketId).emit('invite:received', {
      inviteId: invite.id,
      from: { id: client.id, name: this.presenceNameOf(client.id, user) },
      expiresAt: invite.expiresAt,
    });
    return { success: true, inviteId: invite.id, expiresAt: invite.expiresAt };
  }

  @SubscribeMessage('invite:respond')
  async handleInviteRespond(
    @MessageBody() data: { inviteId: string; accept: boolean; playerKey: string },
    @ConnectedSocket() client: Socket,
  ) {
    const invite = this.presence.getInvite(data?.inviteId);
    // Only the target can answer; for anyone else the request does not exist
    if (!invite || invite.toId !== client.id) {
      return { success: false, error: 'Request expired' };
    }
    // Removed before any await so the same request cannot be answered twice
    this.presence.removeInvite(invite);

    const user = await this.getSocketUser(client.id);
    if (data.accept !== true) {
      this.server.to(invite.fromId).emit('invite:declined', {
        inviteId: invite.id,
        byName: this.presenceNameOf(client.id, user),
      });
      return { success: true };
    }

    const inviterUser = await this.getSocketUser(invite.fromId);
    // Checked after the awaits: either side may have disconnected or taken a seat meanwhile
    const inviterSocket = this.server.sockets.sockets.get(invite.fromId);
    if (!inviterSocket?.connected || !client.connected || this.isSeated(invite.fromId) || this.isSeated(client.id)) {
      this.server.to(invite.fromId).emit('invite:expired', { inviteId: invite.id });
      return { success: false, error: 'Player no longer available' };
    }

    const room = this.openRoom(
      inviterSocket,
      this.presenceNameOf(invite.fromId, inviterUser),
      inviterUser?.id ?? null,
      invite.fromPlayerKey ?? this.presence.available.get(invite.fromId)?.playerKey,
      invite.difficulty,
    );
    const playerKey =
      typeof data.playerKey === 'string' && data.playerKey
        ? data.playerKey
        : this.presence.available.get(client.id)?.playerKey;
    room.players.push(this.newPlayer(client.id, this.presenceNameOf(client.id, user), user?.id ?? null, playerKey, false));
    this.rooms.save(room);
    client.join(room.id);
    this.onSeated(client.id);

    const roomInfo = {
      id: room.id,
      players: this.publicPlayers(room),
      difficulty: room.difficulty,
      showOpponentMoves: room.showOpponentMoves,
      gameStarted: false,
    };
    this.server.to(invite.fromId).emit('invite:accepted', { inviteId: invite.id, room: roomInfo });
    console.log(`Game created from request: ${room.id}`);

    return { success: true, room: roomInfo };
  }

  @SubscribeMessage('invite:cancel')
  handleInviteCancel(
    @MessageBody() data: { inviteId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const invite = this.presence.getInvite(data?.inviteId);
    // Already expired or answered: nothing left to cancel
    if (!invite) return { success: true };
    if (invite.fromId !== client.id) {
      return { success: false, error: 'Request expired' };
    }
    this.presence.removeInvite(invite);
    this.server.to(invite.toId).emit('invite:cancelled', { inviteId: invite.id });
    return { success: true };
  }

  // Available, connected sockets whose person has no current room: not seated on this socket,
  // and no seat (connected or in its grace period) held for the same playerKey or userId
  private listedPlayers(): PresenceEntry[] {
    const seatedSockets = new Set<string>();
    const heldKeys = new Set<string>();
    const heldUsers = new Set<string>();
    for (const room of this.rooms.values()) {
      for (const p of room.players) {
        seatedSockets.add(p.socketId);
        if (p.playerKey) heldKeys.add(p.playerKey);
        if (p.userId) heldUsers.add(p.userId);
      }
    }
    return [...this.presence.available.values()].filter(
      e =>
        this.server.sockets.sockets.get(e.socketId)?.connected &&
        !seatedSockets.has(e.socketId) &&
        !(e.playerKey && heldKeys.has(e.playerKey)) &&
        !(e.userId && heldUsers.has(e.userId)),
    );
  }

  private isSeated(socketId: string): boolean {
    for (const room of this.rooms.values()) {
      if (room.players.some(p => p.socketId === socketId)) return true;
    }
    return false;
  }

  private presenceNameOf(socketId: string, user: SessionUser | null): string {
    return this.presence.available.get(socketId)?.name ?? presenceName(undefined, user?.name);
  }

  // A socket that takes a seat drops its pending requests and leaves the online list
  private onSeated(socketId: string) {
    this.clearInvitesOf(socketId);
    this.schedulePresenceChanged();
  }

  // The other side hears 'cancelled' when the inviter left, 'expired' when the target left
  private clearInvitesOf(socketId: string) {
    for (const invite of this.presence.invitesOf(socketId)) {
      this.presence.removeInvite(invite);
      if (invite.fromId === socketId) {
        this.server.to(invite.toId).emit('invite:cancelled', { inviteId: invite.id });
      } else {
        this.server.to(invite.fromId).emit('invite:expired', { inviteId: invite.id });
      }
    }
  }

  // Trailing throttle: at most one presence:changed per second, only when the listed set changed
  private schedulePresenceChanged() {
    if (this.presenceTimer) return;
    const delay = Math.max(0, this.lastPresenceEmitAt + PRESENCE_EMIT_INTERVAL_MS - Date.now());
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      const listed = this.listedPlayers();
      const signature = listed
        .map(e => e.socketId)
        .sort()
        .join(',');
      if (signature === this.lastPresenceSignature) return;
      this.lastPresenceSignature = signature;
      this.lastPresenceEmitAt = Date.now();
      this.server.emit('presence:changed', { count: listed.length });
    }, delay);
  }

  private endRound(room: GameRoom) {
    room.roundActive = false;
    const [pairs0, pairs1] = room.roundPairs;
    if (pairs0 === pairs1) return; // Tie: nobody wins the round

    const winnerIndex = pairs0 > pairs1 ? 0 : 1;
    room.roundWins[winnerIndex] += 1;
    if (room.roundWins[winnerIndex] < ROUND_WINS_TO_WIN_GAME) return;

    // Snapshot before resetting so a rematch can start right away
    const players = [...room.players];
    const roundWins = [...room.roundWins];
    const totalPairs = [...room.totalPairs];
    const difficulty = room.gameDifficulty;
    const startedAt = room.gameStartedAt ?? new Date();
    const roundsPlayed = room.currentRound;
    this.resetGameState(room);

    this.saveGameResult(players, winnerIndex, roundWins, totalPairs, difficulty, startedAt, roundsPlayed).catch(
      error => console.error(`Failed to save game result for room ${room.id}:`, error),
    );
  }

  private async saveGameResult(
    players: Player[],
    winnerIndex: number,
    roundWins: number[],
    totalPairs: number[],
    difficulty: string,
    startedAt: Date,
    roundsPlayed: number,
    forfeit = false,
  ) {
    // Only head-to-head games count
    if (players.length !== 2) return;
    const userIds = players.map(p => p.userId ?? null);
    // Skip games with no identified player, and games played against yourself
    if (userIds.every(id => !id) || (userIds[0] && userIds[0] === userIds[1])) return;

    const loserIndex = winnerIndex === 0 ? 1 : 0;
    await this.prisma.game.create({
      data: {
        gameType: 'joda-memory',
        status: 'completed',
        player1Id: userIds[0],
        player2Id: userIds[1],
        winnerId: userIds[winnerIndex],
        // roundsPlayed includes tied rounds; the leaderboard only counts games that reached round 4
        settings: forfeit ? { difficulty, roundWins, roundsPlayed, forfeit: true } : { difficulty, roundWins, roundsPlayed },
        startedAt,
        completedAt: new Date(),
        matchHistory: {
          create: [0, 1]
            .filter(i => userIds[i])
            .map(i => ({
              userId: userIds[i] as string,
              opponentId: userIds[i === 0 ? 1 : 0],
              result: i === winnerIndex ? 'win' : 'loss',
              roundsWon: roundWins[i],
              roundsLost: roundWins[i === 0 ? 1 : 0],
              totalScore: totalPairs[i],
            })),
        },
      },
    });
    console.log(
      `Saved joda-memory game${forfeit ? ' (forfeit)' : ''}: winner ${players[winnerIndex]?.name}, loser ${players[loserIndex]?.name}`,
    );
  }

  private resetGameState(room: GameRoom) {
    room.gameActive = false;
    room.roundActive = false;
    room.gameHasFlips = false;
    room.currentRound = 1;
    room.roundWins = [0, 0];
    room.roundPairs = [0, 0];
    room.totalPairs = [0, 0];
    room.flippedCards = [];
    room.matchedCards = [];
    room.currentPlayerIndex = 0;
    room.gameStartedAt = null;
  }

  // A valid legacy deck is 4, 8 or 12 pairs where every iconName appears exactly twice
  private getDeckDifficulty(cards: any): Difficulty | null {
    if (!Array.isArray(cards)) return null;
    const difficulty = (Object.keys(PAIRS_BY_DIFFICULTY) as Difficulty[]).find(
      d => PAIRS_BY_DIFFICULTY[d] * 2 === cards.length,
    );
    if (!difficulty) return null;

    const counts = new Map<string, number>();
    for (const card of cards) {
      if (typeof card?.iconName !== 'string' || !card.iconName) return null;
      counts.set(card.iconName, (counts.get(card.iconName) ?? 0) + 1);
    }
    return [...counts.values()].every(c => c === 2) ? difficulty : null;
  }

  private startGraceTimer(room: GameRoom, player: Player) {
    this.clearGraceTimer(player);
    const timer = setTimeout(() => {
      this.graceTimers.delete(player);
      if (this.rooms.get(room.id) === room && room.players.includes(player) && !player.connected) {
        this.removePlayer(room.id, room, player.socketId);
      }
    }, graceMs(room.gameStarted && room.gameActive));
    this.graceTimers.set(player, timer);
  }

  private clearGraceTimer(player: Player) {
    const timer = this.graceTimers.get(player);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(player);
    }
  }

  // playerKey lets a socket take over a seat, so it is never sent to clients
  private publicPlayer(player: Player) {
    const { playerKey, disconnectedAt, ...rest } = player;
    return rest;
  }

  private publicPlayers(room: GameRoom) {
    return room.players.map(p => this.publicPlayer(p));
  }

  private async getSocketUserId(socketId: string): Promise<string | null> {
    return (await this.getSocketUser(socketId))?.id ?? null;
  }

  private async getSocketUser(socketId: string): Promise<SessionUser | null> {
    return (await this.socketUsers.get(socketId)) ?? null;
  }

  private sanitizeRoom(room: GameRoom) {
    return {
      id: room.id,
      players: this.publicPlayers(room),
      difficulty: room.difficulty,
      gameStarted: room.gameStarted,
      currentPlayerIndex: room.currentPlayerIndex,
      currentRound: room.currentRound,
      roundWins: room.roundWins,
      showOpponentMoves: room.showOpponentMoves,
    };
  }
}
