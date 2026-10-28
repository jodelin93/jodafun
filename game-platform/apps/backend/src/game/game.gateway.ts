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

interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  socketId: string;
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

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    // Find and clean up any rooms this client was in
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.socketId === client.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);

        // Notify other players
        this.server.to(roomId).emit('playerLeft', {
          playerId: client.id,
          players: room.players,
        });

        // Delete room if empty
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
        }
      }
    }
  }

  @SubscribeMessage('createGame')
  handleCreateGame(
    @MessageBody() data: { playerName: string; difficulty: 'easy' | 'medium' | 'hard' },
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
  handleJoinGame(
    @MessageBody() data: { roomId: string; playerName: string },
    @ConnectedSocket() client: Socket,
  ) {
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
    };

    room.players.push(player);
    client.join(data.roomId);

    // Notify all players in the room
    this.server.to(data.roomId).emit('playerJoined', {
      player,
      players: room.players,
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
        players: room.players,
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

    room.gameStarted = true;
    room.cards = data.cards;
    room.currentPlayerIndex = 0;

    // Reset scores
    room.players.forEach(p => {
      p.score = 0;
    });

    this.server.to(data.roomId).emit('gameStarted', {
      cards: room.cards,
      currentPlayerIndex: room.currentPlayerIndex,
      players: room.players,
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

    // Broadcast to all players in the room
    this.server.to(data.roomId).emit('cardFlipped', {
      cardId: data.cardId,
      playerId: client.id,
    });

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
      players: room.players,
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
      players: room.players,
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

    // Remove player from room
    const playerIndex = room.players.findIndex(p => p.socketId === client.id);
    if (playerIndex !== -1) {
      const leavingPlayer = room.players[playerIndex];
      room.players.splice(playerIndex, 1);

      // Leave the socket room
      client.leave(data.roomId);

      // Notify remaining players
      this.server.to(data.roomId).emit('playerLeft', {
        playerId: client.id,
        playerName: leavingPlayer.name,
        players: room.players,
      });

      // If room is empty, delete it
      if (room.players.length === 0) {
        this.rooms.delete(data.roomId);
        console.log(`Room ${data.roomId} deleted (empty)`);
      } else {
        // If host left, assign new host
        if (leavingPlayer.isHost && room.players.length > 0) {
          room.players[0].isHost = true;
          room.hostId = room.players[0].socketId;
          this.server.to(data.roomId).emit('newHost', {
            hostId: room.players[0].socketId,
            players: room.players,
          });
        }
      }

      console.log(`Player ${leavingPlayer.name} left room ${data.roomId}`);
    }

    return { success: true };
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private sanitizeRoom(room: GameRoom) {
    return {
      id: room.id,
      players: room.players,
      difficulty: room.difficulty,
      gameStarted: room.gameStarted,
      currentPlayerIndex: room.currentPlayerIndex,
      currentRound: room.currentRound,
      roundWins: room.roundWins,
      showOpponentMoves: room.showOpponentMoves,
    };
  }
}
