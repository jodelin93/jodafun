import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSessionUser } from '../auth/session';

// Pairs dealt per difficulty; a deck must contain exactly twice this many cards
export const PAIRS_BY_DIFFICULTY = { easy: 4, medium: 8, hard: 12 } as const;
const ROUND_WINS_TO_WIN_GAME = 4;

// How long a disconnected player keeps their seat before being removed
const graceMs = (gameInProgress: boolean) =>
  gameInProgress
    ? Number(process.env.ROOM_GRACE_GAME_MS) || 60_000
    : Number(process.env.ROOM_GRACE_LOBBY_MS) || 5 * 60_000;

interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  socketId: string;
  userId?: string | null; // set from the session cookie; null for anonymous sockets
  playerKey?: string; // client-generated, stable per browser tab; never sent to clients
  connected: boolean; // false while the player is in the disconnect grace period
}

interface GameRoom {
  id: string;
  hostId: string;
  players: Player[];
  difficulty: 'easy' | 'medium' | 'hard';
  gameStarted: boolean;
  currentPlayerIndex: number;
  cards: any[];
  flippedCards: number[];
  currentRound: number;
  roundWins: number[]; // [player1RoundWins, player2RoundWins]
  showOpponentMoves: boolean; // Whether players can see opponent's moves
  // Server-side scoring state (never sent to clients)
  gameActive: boolean; // true from the first deal until the game ends or is abandoned
  roundActive: boolean; // true while the current deal still has unmatched cards
  matchedCards: number[];
  roundPairs: number[]; // pairs per player in the current round
  totalPairs: number[]; // pairs per player across the whole game
  gameDifficulty: 'easy' | 'medium' | 'hard';
  gameStartedAt: Date | null;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private rooms: Map<string, GameRoom> = new Map();
  // userId per socket, resolved from the session cookie on connect (null = anonymous)
  private socketUsers: Map<string, Promise<string | null>> = new Map();
  // Removal timers for disconnected players in their grace period
  private graceTimers: Map<Player, NodeJS.Timeout> = new Map();

  constructor(private prisma: PrismaService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.socketUsers.set(
      client.id,
      resolveSessionUser(this.prisma, client.handshake.headers.cookie)
        .then(user => user?.id ?? null)
        .catch(error => {
          console.error(`Session lookup failed for ${client.id}:`, error);
          return null;
        }),
    );
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.socketUsers.delete(client.id);

    // Keep the seat for a grace period so the player can rejoin from a new socket
    for (const [roomId, room] of this.rooms.entries()) {
      const player = room.players.find(p => p.socketId === client.id);
      if (!player) continue;

      player.connected = false;
      this.server.to(roomId).emit('playerDisconnected', {
        playerId: player.id,
        playerName: player.name,
        players: this.publicPlayers(room),
      });

      const timer = setTimeout(() => {
        this.graceTimers.delete(player);
        if (this.rooms.get(roomId) === room && room.players.includes(player) && !player.connected) {
          this.removePlayer(roomId, room, player.socketId);
        }
      }, graceMs(room.gameStarted && room.gameActive));
      this.graceTimers.set(player, timer);
    }
  }

  @SubscribeMessage('rejoinRoom')
  async handleRejoinRoom(
    @MessageBody() data: { roomId: string; playerKey: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.rooms.get(data?.roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player =
      typeof data.playerKey === 'string' && data.playerKey
        ? room.players.find(p => p.playerKey === data.playerKey)
        : undefined;
    if (!player) {
      return { success: false, error: 'Seat not found' };
    }

    this.clearGraceTimer(player);
    const userId = await this.getSocketUserId(client.id);

    // If the old socket is somehow still alive, stop it receiving this room's events
    if (player.socketId !== client.id) {
      this.server.in(player.socketId).socketsLeave(data.roomId);
    }
    if (room.hostId === player.socketId) {
      room.hostId = client.id;
    }
    player.socketId = client.id;
    player.connected = true;
    player.userId = userId;
    client.join(data.roomId);

    this.server.to(data.roomId).emit('playerReconnected', {
      playerId: player.id,
      playerName: player.name,
      players: this.publicPlayers(room),
    });

    console.log(`Player ${player.name} rejoined room ${data.roomId}`);

    return {
      success: true,
      room: {
        id: room.id,
        players: this.publicPlayers(room),
        difficulty: room.difficulty,
        showOpponentMoves: room.showOpponentMoves,
        gameStarted: room.gameStarted,
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
    data: { playerName: string; difficulty: 'easy' | 'medium' | 'hard'; playerKey?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.generateRoomId();

    const host: Player = {
      id: client.id,
      name: data.playerName,
      score: 0,
      isHost: true,
      isReady: false,
      socketId: client.id,
      userId: await this.getSocketUserId(client.id),
      playerKey: typeof data.playerKey === 'string' && data.playerKey ? data.playerKey : undefined,
      connected: true,
    };

    const room: GameRoom = {
      id: roomId,
      hostId: client.id,
      players: [host],
      difficulty: data.difficulty,
      gameStarted: false,
      currentPlayerIndex: 0,
      cards: [],
      flippedCards: [],
      currentRound: 1,
      roundWins: [0, 0],
      showOpponentMoves: true, // Default to showing moves
      gameActive: false,
      roundActive: false,
      matchedCards: [],
      roundPairs: [0, 0],
      totalPairs: [0, 0],
      gameDifficulty: data.difficulty,
      gameStartedAt: null,
    };

    this.rooms.set(roomId, room);
    client.join(roomId);

    console.log(`Game created: ${roomId} by ${data.playerName}`);

    return {
      success: true,
      roomId,
      room: this.sanitizeRoom(room),
    };
  }

  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @MessageBody() data: { roomId: string; playerName: string; playerKey?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.getSocketUserId(client.id);
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return {
        success: false,
        error: 'Game room not found',
      };
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

    const player: Player = {
      id: client.id,
      name: data.playerName,
      score: 0,
      isHost: false,
      isReady: false,
      socketId: client.id,
      userId,
      playerKey: typeof data.playerKey === 'string' && data.playerKey ? data.playerKey : undefined,
      connected: true,
    };

    room.players.push(player);
    client.join(data.roomId);

    // Notify all players in the room
    this.server.to(data.roomId).emit('playerJoined', {
      player: this.publicPlayer(player),
      players: this.publicPlayers(room),
    });

    console.log(`${data.playerName} joined game: ${data.roomId}`);

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
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.find(p => p.socketId === client.id);
    if (player) {
      player.isReady = true;

      // Notify all players
      this.server.to(data.roomId).emit('playerReadyUpdate', {
        playerId: client.id,
        players: this.publicPlayers(room),
      });

      // Check if all players are ready
      const allReady = room.players.every(p => p.isReady) && room.players.length === 2;
      if (allReady) {
        this.server.to(data.roomId).emit('allPlayersReady', {
          message: 'All players ready! Starting game...',
        });
      }

      return { success: true, allReady };
    }

    return { success: false, error: 'Player not found' };
  }

  @SubscribeMessage('startGame')
  handleStartGame(
    @MessageBody() data: { roomId: string; cards: any[] },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.hostId !== client.id) {
      return { success: false, error: 'Only host can start the game' };
    }

    const deckDifficulty = this.getDeckDifficulty(data.cards);
    if (!deckDifficulty) {
      return { success: false, error: 'Invalid deck' };
    }

    if (room.gameActive) {
      // Every deal after the first one in the same game is a new round
      room.currentRound += 1;
    } else {
      room.gameActive = true;
      room.currentRound = 1;
      room.roundWins = [0, 0];
      room.totalPairs = [0, 0];
      room.gameDifficulty = deckDifficulty;
      room.gameStartedAt = new Date();
    }

    room.gameStarted = true;
    room.cards = data.cards;
    room.currentPlayerIndex = 0;
    room.flippedCards = [];
    room.matchedCards = [];
    room.roundPairs = [0, 0];
    room.roundActive = true;

    // Reset scores
    room.players.forEach(p => {
      p.score = 0;
    });

    this.server.to(data.roomId).emit('gameStarted', {
      cards: room.cards,
      currentPlayerIndex: room.currentPlayerIndex,
      players: this.publicPlayers(room),
    });

    return { success: true };
  }

  @SubscribeMessage('toggleOpponentMoves')
  handleToggleOpponentMoves(
    @MessageBody() data: { roomId: string; showOpponentMoves: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Only host can change this setting
    if (client.id !== room.hostId) {
      return { success: false, error: 'Only host can change visibility settings' };
    }

    // Update the setting
    room.showOpponentMoves = data.showOpponentMoves;

    // Broadcast the change to all players in the lobby
    this.server.to(data.roomId).emit('visibilityChanged', {
      showOpponentMoves: room.showOpponentMoves,
    });

    return { success: true };
  }

  @SubscribeMessage('togglePause')
  handleTogglePause(
    @MessageBody() data: { roomId: string; paused: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Broadcast pause state to all players in the room
    this.server.to(data.roomId).emit('gamePaused', {
      paused: data.paused,
      pausedBy: client.id,
    });

    return { success: true };
  }

  @SubscribeMessage('sendChatMessage')
  handleChatMessage(
    @MessageBody() data: { roomId: string; message: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Find the sender's player info
    const sender = room.players.find(p => p.socketId === client.id);

    if (!sender) {
      return { success: false, error: 'Player not found' };
    }

    // Broadcast the message to all players in the room
    this.server.to(data.roomId).emit('chatMessage', {
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
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
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

    // Broadcast to all players in the room
    this.server.to(data.roomId).emit('cardFlipped', {
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

    return { success: true };
  }

  @SubscribeMessage('matchFound')
  handleMatchFound(
    @MessageBody() data: { roomId: string; cardIds: number[] },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const playerIndex = room.players.findIndex(p => p.socketId === client.id);
    if (playerIndex !== -1) {
      room.players[playerIndex].score += 1;
    }

    this.server.to(data.roomId).emit('matchFound', {
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
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Switch turn
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

    this.server.to(data.roomId).emit('noMatch', {
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
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    this.server.to(data.roomId).emit('gameWon', {
      players: this.publicPlayers(room),
    });

    return { success: true };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Leave the socket room, then remove the player and notify the others
    client.leave(data.roomId);
    this.removePlayer(data.roomId, room, client.id);

    return { success: true };
  }

  // Shared by leaveRoom and handleDisconnect
  private removePlayer(roomId: string, room: GameRoom, socketId: string) {
    const playerIndex = room.players.findIndex(p => p.socketId === socketId);
    if (playerIndex === -1) return;

    const leavingPlayer = room.players[playerIndex];
    this.clearGraceTimer(leavingPlayer);
    const gameInProgress = room.gameStarted && room.gameActive;
    room.players.splice(playerIndex, 1);

    // A game in progress is abandoned: nothing is saved and the room goes back to the lobby
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
    });

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else if (leavingPlayer.isHost) {
      // If host left, assign new host
      room.players[0].isHost = true;
      room.hostId = room.players[0].socketId;
      this.server.to(roomId).emit('newHost', {
        hostId: room.players[0].socketId,
        players: this.publicPlayers(room),
      });
    }

    console.log(`Player ${leavingPlayer.name} left room ${roomId}`);
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
    this.resetGameState(room);

    this.saveGameResult(players, winnerIndex, roundWins, totalPairs, difficulty, startedAt).catch(
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
        settings: { difficulty, roundWins },
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
      `Saved joda-memory game: winner ${players[winnerIndex]?.name}, loser ${players[loserIndex]?.name}`,
    );
  }

  private resetGameState(room: GameRoom) {
    room.gameActive = false;
    room.roundActive = false;
    room.currentRound = 1;
    room.roundWins = [0, 0];
    room.roundPairs = [0, 0];
    room.totalPairs = [0, 0];
    room.flippedCards = [];
    room.matchedCards = [];
    room.currentPlayerIndex = 0;
    room.gameStartedAt = null;
  }

  // A valid deck is 4, 8 or 12 pairs where every iconName appears exactly twice
  private getDeckDifficulty(cards: any[]): 'easy' | 'medium' | 'hard' | null {
    if (!Array.isArray(cards)) return null;
    const difficulty = (Object.keys(PAIRS_BY_DIFFICULTY) as Array<keyof typeof PAIRS_BY_DIFFICULTY>).find(
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

  private clearGraceTimer(player: Player) {
    const timer = this.graceTimers.get(player);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(player);
    }
  }

  // playerKey lets a socket take over a seat, so it is never sent to clients
  private publicPlayer(player: Player) {
    const { playerKey, ...rest } = player;
    return rest;
  }

  private publicPlayers(room: GameRoom) {
    return room.players.map(p => this.publicPlayer(p));
  }

  private async getSocketUserId(socketId: string): Promise<string | null> {
    return (await this.socketUsers.get(socketId)) ?? null;
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
