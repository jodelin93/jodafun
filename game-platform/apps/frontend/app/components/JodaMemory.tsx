'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSoundManager } from '../lib/sounds/soundManager';
import SoundControls from './SoundControls';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import {
  Gamepad2, Dices, Target, Circus, Palette, Drama, Film, Mic,
  Piano, Guitar, Music, Disc, Sparkles, Crown, Trophy, Star,
  Heart, Diamond, Zap, Rocket, Bot, Users, Clock, RotateCcw,
  ArrowLeft, Volume2, Brain, X, Eye, EyeOff, Copy, Check, Link2,
  Pause, Play, Home, LogOut, MessageSquare, Send, Gem, Flame,
  Cherry, Cpu, Puzzle, Sword, Wand2, Smile, Ghost, Coffee,
  Cake, PartyPopper, Gift, Sparkle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Socket } from 'socket.io-client';

type Card = {
  id: number;
  iconName: string;
  Icon: LucideIcon;
  imageUrl?: string;
  color: string;
  isFlipped: boolean;
  isMatched: boolean;
};

type Player = {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  socketId: string;
};

type LobbyPlayer = {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  socketId: string;
};

type Difficulty = 'easy' | 'medium' | 'hard';
type GameMode = 'single' | 'multiplayer' | null;

// Large pool of beautiful curated images using Picsum Photos (free, high-quality)
// Images are randomly selected from this pool each game for variety
const IMAGE_POOL = [
  // Nature & Landscapes (50+ images)
  { name: 'img1', Icon: Crown, imageUrl: 'https://picsum.photos/id/10/400/400', color: 'from-green-400 to-emerald-500' },
  { name: 'img2', Icon: Gem, imageUrl: 'https://picsum.photos/id/11/400/400', color: 'from-blue-400 to-cyan-500' },
  { name: 'img3', Icon: Star, imageUrl: 'https://picsum.photos/id/12/400/400', color: 'from-purple-400 to-pink-500' },
  { name: 'img4', Icon: Heart, imageUrl: 'https://picsum.photos/id/13/400/400', color: 'from-orange-400 to-red-500' },
  { name: 'img5', Icon: Trophy, imageUrl: 'https://picsum.photos/id/14/400/400', color: 'from-amber-400 to-yellow-500' },
  { name: 'img6', Icon: Rocket, imageUrl: 'https://picsum.photos/id/15/400/400', color: 'from-indigo-400 to-purple-500' },
  { name: 'img7', Icon: Flame, imageUrl: 'https://picsum.photos/id/16/400/400', color: 'from-red-400 to-orange-500' },
  { name: 'img8', Icon: Sparkle, imageUrl: 'https://picsum.photos/id/17/400/400', color: 'from-yellow-300 to-pink-400' },
  { name: 'img9', Icon: Diamond, imageUrl: 'https://picsum.photos/id/18/400/400', color: 'from-cyan-400 to-blue-500' },
  { name: 'img10', Icon: Wand2, imageUrl: 'https://picsum.photos/id/19/400/400', color: 'from-purple-300 to-pink-400' },
  { name: 'img11', Icon: PartyPopper, imageUrl: 'https://picsum.photos/id/20/400/400', color: 'from-pink-400 to-rose-500' },
  { name: 'img12', Icon: Gift, imageUrl: 'https://picsum.photos/id/21/400/400', color: 'from-green-400 to-teal-500' },
  { name: 'img13', Icon: Cake, imageUrl: 'https://picsum.photos/id/22/400/400', color: 'from-fuchsia-400 to-purple-500' },
  { name: 'img14', Icon: Coffee, imageUrl: 'https://picsum.photos/id/23/400/400', color: 'from-amber-600 to-orange-700' },
  { name: 'img15', Icon: Ghost, imageUrl: 'https://picsum.photos/id/24/400/400', color: 'from-slate-300 to-gray-400' },
  { name: 'img16', Icon: Sword, imageUrl: 'https://picsum.photos/id/25/400/400', color: 'from-slate-400 to-gray-600' },
  { name: 'img17', Icon: Brain, imageUrl: 'https://picsum.photos/id/26/400/400', color: 'from-rose-400 to-pink-500' },
  { name: 'img18', Icon: Smile, imageUrl: 'https://picsum.photos/id/27/400/400', color: 'from-yellow-400 to-orange-500' },
  { name: 'img19', Icon: Puzzle, imageUrl: 'https://picsum.photos/id/28/400/400', color: 'from-blue-400 to-indigo-500' },
  { name: 'img20', Icon: Cpu, imageUrl: 'https://picsum.photos/id/29/400/400', color: 'from-emerald-400 to-green-500' },
  { name: 'img21', Icon: Cherry, imageUrl: 'https://picsum.photos/id/30/400/400', color: 'from-red-400 to-rose-500' },
  { name: 'img22', Icon: Crown, imageUrl: 'https://picsum.photos/id/31/400/400', color: 'from-violet-400 to-purple-500' },
  { name: 'img23', Icon: Gem, imageUrl: 'https://picsum.photos/id/32/400/400', color: 'from-sky-400 to-blue-500' },
  { name: 'img24', Icon: Star, imageUrl: 'https://picsum.photos/id/33/400/400', color: 'from-pink-400 to-fuchsia-500' },
  { name: 'img25', Icon: Heart, imageUrl: 'https://picsum.photos/id/34/400/400', color: 'from-lime-400 to-green-500' },
  { name: 'img26', Icon: Trophy, imageUrl: 'https://picsum.photos/id/35/400/400', color: 'from-orange-400 to-red-500' },
  { name: 'img27', Icon: Rocket, imageUrl: 'https://picsum.photos/id/36/400/400', color: 'from-cyan-400 to-teal-500' },
  { name: 'img28', Icon: Flame, imageUrl: 'https://picsum.photos/id/37/400/400', color: 'from-amber-400 to-yellow-500' },
  { name: 'img29', Icon: Sparkle, imageUrl: 'https://picsum.photos/id/38/400/400', color: 'from-indigo-400 to-blue-500' },
  { name: 'img30', Icon: Diamond, imageUrl: 'https://picsum.photos/id/39/400/400', color: 'from-rose-400 to-pink-500' },
  { name: 'img31', Icon: Wand2, imageUrl: 'https://picsum.photos/id/40/400/400', color: 'from-green-400 to-emerald-500' },
  { name: 'img32', Icon: PartyPopper, imageUrl: 'https://picsum.photos/id/41/400/400', color: 'from-purple-400 to-fuchsia-500' },
  { name: 'img33', Icon: Gift, imageUrl: 'https://picsum.photos/id/42/400/400', color: 'from-blue-400 to-cyan-500' },
  { name: 'img34', Icon: Cake, imageUrl: 'https://picsum.photos/id/43/400/400', color: 'from-red-400 to-orange-500' },
  { name: 'img35', Icon: Coffee, imageUrl: 'https://picsum.photos/id/44/400/400', color: 'from-yellow-400 to-amber-500' },
  { name: 'img36', Icon: Ghost, imageUrl: 'https://picsum.photos/id/45/400/400', color: 'from-slate-400 to-gray-500' },
  { name: 'img37', Icon: Sword, imageUrl: 'https://picsum.photos/id/47/400/400', color: 'from-teal-400 to-cyan-500' },
  { name: 'img38', Icon: Brain, imageUrl: 'https://picsum.photos/id/48/400/400', color: 'from-pink-400 to-rose-500' },
  { name: 'img39', Icon: Smile, imageUrl: 'https://picsum.photos/id/49/400/400', color: 'from-orange-400 to-yellow-500' },
  { name: 'img40', Icon: Puzzle, imageUrl: 'https://picsum.photos/id/50/400/400', color: 'from-indigo-400 to-purple-500' },
  { name: 'img41', Icon: Cpu, imageUrl: 'https://picsum.photos/id/51/400/400', color: 'from-emerald-400 to-teal-500' },
  { name: 'img42', Icon: Cherry, imageUrl: 'https://picsum.photos/id/52/400/400', color: 'from-red-400 to-pink-500' },
  { name: 'img43', Icon: Crown, imageUrl: 'https://picsum.photos/id/60/400/400', color: 'from-violet-400 to-indigo-500' },
  { name: 'img44', Icon: Gem, imageUrl: 'https://picsum.photos/id/62/400/400', color: 'from-sky-400 to-cyan-500' },
  { name: 'img45', Icon: Star, imageUrl: 'https://picsum.photos/id/63/400/400', color: 'from-fuchsia-400 to-pink-500' },
  { name: 'img46', Icon: Heart, imageUrl: 'https://picsum.photos/id/64/400/400', color: 'from-lime-400 to-emerald-500' },
  { name: 'img47', Icon: Trophy, imageUrl: 'https://picsum.photos/id/65/400/400', color: 'from-orange-400 to-amber-500' },
  { name: 'img48', Icon: Rocket, imageUrl: 'https://picsum.photos/id/66/400/400', color: 'from-cyan-400 to-blue-500' },
  { name: 'img49', Icon: Flame, imageUrl: 'https://picsum.photos/id/67/400/400', color: 'from-amber-400 to-orange-500' },
  { name: 'img50', Icon: Sparkle, imageUrl: 'https://picsum.photos/id/68/400/400', color: 'from-indigo-400 to-violet-500' },
  { name: 'img51', Icon: Diamond, imageUrl: 'https://picsum.photos/id/69/400/400', color: 'from-rose-400 to-red-500' },
  { name: 'img52', Icon: Wand2, imageUrl: 'https://picsum.photos/id/70/400/400', color: 'from-green-400 to-teal-500' },
  { name: 'img53', Icon: PartyPopper, imageUrl: 'https://picsum.photos/id/72/400/400', color: 'from-purple-400 to-pink-500' },
  { name: 'img54', Icon: Gift, imageUrl: 'https://picsum.photos/id/74/400/400', color: 'from-blue-400 to-indigo-500' },
  { name: 'img55', Icon: Cake, imageUrl: 'https://picsum.photos/id/75/400/400', color: 'from-red-400 to-rose-500' },
  { name: 'img56', Icon: Coffee, imageUrl: 'https://picsum.photos/id/76/400/400', color: 'from-yellow-400 to-orange-500' },
  { name: 'img57', Icon: Ghost, imageUrl: 'https://picsum.photos/id/77/400/400', color: 'from-slate-400 to-zinc-500' },
  { name: 'img58', Icon: Sword, imageUrl: 'https://picsum.photos/id/78/400/400', color: 'from-teal-400 to-emerald-500' },
  { name: 'img59', Icon: Brain, imageUrl: 'https://picsum.photos/id/79/400/400', color: 'from-pink-400 to-fuchsia-500' },
  { name: 'img60', Icon: Smile, imageUrl: 'https://picsum.photos/id/80/400/400', color: 'from-orange-400 to-red-500' },
  // More diverse images
  { name: 'img61', Icon: Puzzle, imageUrl: 'https://picsum.photos/id/82/400/400', color: 'from-indigo-400 to-blue-500' },
  { name: 'img62', Icon: Cpu, imageUrl: 'https://picsum.photos/id/83/400/400', color: 'from-emerald-400 to-green-500' },
  { name: 'img63', Icon: Cherry, imageUrl: 'https://picsum.photos/id/84/400/400', color: 'from-red-400 to-orange-500' },
  { name: 'img64', Icon: Crown, imageUrl: 'https://picsum.photos/id/85/400/400', color: 'from-violet-400 to-purple-500' },
  { name: 'img65', Icon: Gem, imageUrl: 'https://picsum.photos/id/86/400/400', color: 'from-sky-400 to-blue-500' },
  { name: 'img66', Icon: Star, imageUrl: 'https://picsum.photos/id/87/400/400', color: 'from-fuchsia-400 to-rose-500' },
  { name: 'img67', Icon: Heart, imageUrl: 'https://picsum.photos/id/88/400/400', color: 'from-lime-400 to-green-500' },
  { name: 'img68', Icon: Trophy, imageUrl: 'https://picsum.photos/id/89/400/400', color: 'from-orange-400 to-yellow-500' },
  { name: 'img69', Icon: Rocket, imageUrl: 'https://picsum.photos/id/90/400/400', color: 'from-cyan-400 to-teal-500' },
  { name: 'img70', Icon: Flame, imageUrl: 'https://picsum.photos/id/91/400/400', color: 'from-amber-400 to-red-500' },
];

const GRID_COLS = {
  easy: 4,
  medium: 4,
  hard: 6
};

export default function JodaMemory() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gameMode, setGameMode] = useState<GameMode>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [soundInitialized, setSoundInitialized] = useState(false);
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);

  // Round-based game state
  const [currentRound, setCurrentRound] = useState(1);
  const [roundWins, setRoundWins] = useState<number[]>([0, 0]); // [player1Wins, player2Wins]
  const [roundWinner, setRoundWinner] = useState<number | null>(null);
  const [overallWinner, setOverallWinner] = useState<number | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showOpponentMoves, setShowOpponentMoves] = useState(true);

  // Chat states
  const [chatMessages, setChatMessages] = useState<Array<{playerName: string; playerId: string; message: string; timestamp: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);

  // Multiplayer states
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isInLobby, setIsInLobby] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Initialize sound manager
  useEffect(() => {
    const soundManager = getSoundManager();
    soundManager.init().then(() => {
      setSoundInitialized(true);
    });
  }, []);

  // Load best time from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`joda-memory-best-${difficulty}`);
    if (saved) {
      setBestTime(parseInt(saved));
    } else {
      setBestTime(null);
    }
  }, [difficulty]);

  // Initialize cards
  useEffect(() => {
    const shuffledCards = shuffleCards(difficulty);
    setCards(shuffledCards);
  }, []);

  // Load saved game state from localStorage on mount
  useEffect(() => {
    const savedGameState = localStorage.getItem('joda-memory-game-state');
    if (savedGameState) {
      try {
        const state = JSON.parse(savedGameState);
        // Only restore if the game was actually in progress (not won)
        if (state.gameStarted && !state.gameWon && state.gameMode === 'single') {
          // Reconstruct cards with Icon components from IMAGE_POOL
          const restoredCards = state.cards.map((savedCard: any) => {
            // Find the matching icon data from IMAGE_POOL
            const iconData = IMAGE_POOL.find(
              item => item.name === savedCard.iconName
            );

            return {
              ...savedCard,
              Icon: iconData?.Icon || Crown, // Fallback to Crown if not found
            };
          });

          setGameMode(state.gameMode);
          setDifficulty(state.difficulty);
          setCards(restoredCards);
          setPlayers(state.players);
          setCurrentPlayerIndex(state.currentPlayerIndex);
          setGameStarted(state.gameStarted);
          setMoves(state.moves);
          setTimer(state.timer);
          setCurrentRound(state.currentRound);
          setRoundWins(state.roundWins);
        } else {
          // Clear old/completed game state
          localStorage.removeItem('joda-memory-game-state');
        }
      } catch (error) {
        console.error('Error loading saved game state:', error);
        localStorage.removeItem('joda-memory-game-state');
      }
    }
  }, []);

  // Save game state to localStorage whenever it changes
  useEffect(() => {
    // Only save if game is in progress (started but not won) and in single player mode
    if (gameStarted && !gameWon && gameMode === 'single' && cards.length > 0) {
      // Remove Icon component from cards before saving (can't serialize functions)
      const serializableCards = cards.map(({ Icon, ...rest }) => rest);

      const gameState = {
        gameMode,
        difficulty,
        cards: serializableCards,
        players,
        currentPlayerIndex,
        gameStarted,
        gameWon,
        moves,
        timer,
        currentRound,
        roundWins,
        timestamp: Date.now()
      };
      localStorage.setItem('joda-memory-game-state', JSON.stringify(gameState));
    } else if (gameWon || !gameStarted) {
      // Clear saved state when game is won or not started
      localStorage.removeItem('joda-memory-game-state');
    }
  }, [gameMode, difficulty, cards, players, currentPlayerIndex, gameStarted, gameWon, moves, timer, currentRound, roundWins]);

  // Play sound when it becomes player 1's turn (not for AI)
  useEffect(() => {
    if (gameStarted && !gameWon && currentPlayerIndex === 0 && soundInitialized) {
      // Don't play on initial turn
      if (moves > 0) {
        const soundManager = getSoundManager();
        soundManager.play('myTurn');
      }
    }
    // Note: AI turn (currentPlayerIndex === 1 in single mode) does not play myTurn sound
  }, [currentPlayerIndex, gameStarted, gameWon, soundInitialized, moves]);

  // Timer effect
  useEffect(() => {
    if (gameStarted && !gameWon && !gamePaused) {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameStarted, gameWon, gamePaused]);

  // WebSocket connection for multiplayer
  useEffect(() => {
    if (gameMode === 'multiplayer') {
      socketRef.current = connectSocket();
      const socket = socketRef.current;

      // Listen for player joined
      socket.on('playerJoined', (data: { player: LobbyPlayer; players: LobbyPlayer[] }) => {
        setLobbyPlayers(data.players);
        if (soundInitialized) {
          getSoundManager().play('match');
        }
      });

      // Listen for player ready updates
      socket.on('playerReadyUpdate', (data: { playerId: string; players: LobbyPlayer[] }) => {
        setLobbyPlayers(data.players);
      });

      // Listen for all players ready
      socket.on('allPlayersReady', (data: { message: string }) => {
        console.log(data.message);
      });

      // Listen for game started
      socket.on('gameStarted', (data: { cards: any[]; currentPlayerIndex: number; players: Player[] }) => {
        const mappedCards: Card[] = data.cards.map((card: any, index: number) => ({
          id: index,
          iconName: card.iconName,
          Icon: ICON_SETS[difficulty].find(icon => icon.name === card.iconName)?.Icon || Gamepad2,
          isFlipped: false,
          isMatched: false,
        }));

        setCards(mappedCards);
        setPlayers(data.players);
        setCurrentPlayerIndex(data.currentPlayerIndex);
        setGameStarted(true);
        setIsInLobby(false);
        setTimer(0);
        setMoves(0);
        setGameWon(false);

        if (soundInitialized) {
          getSoundManager().play('start');
        }
      });

      // Listen for card flipped
      socket.on('cardFlipped', (data: { cardId: number; playerId: string }) => {
        // This will be handled by the game logic
        console.log('Card flipped by player:', data.playerId);
      });

      // Listen for match found
      socket.on('matchFound', (data: { cardIds: number[]; playerId: string; players: Player[] }) => {
        setPlayers(data.players);
        if (soundInitialized) {
          getSoundManager().play('match');
        }
      });

      // Listen for no match
      socket.on('noMatch', (data: { cardIds: number[]; currentPlayerIndex: number }) => {
        setCurrentPlayerIndex(data.currentPlayerIndex);
        if (soundInitialized) {
          getSoundManager().play('turnChange');
        }
      });

      // Listen for game won
      socket.on('gameWon', (data: { players: Player[] }) => {
        setPlayers(data.players);
        setGameWon(true);
        if (soundInitialized) {
          getSoundManager().play('win');
        }
      });

      // Listen for player left
      socket.on('playerLeft', (data: { playerId: string; playerName: string; players: LobbyPlayer[] }) => {
        setLobbyPlayers(data.players);
        if (data.players.length === 0) {
          handleBackToMenu();
        }
      });

      // Listen for new host assignment
      socket.on('newHost', (data: { hostId: string; players: LobbyPlayer[] }) => {
        setLobbyPlayers(data.players);
        // Update isHost if this client became the new host
        if (data.hostId === socket.id) {
          setIsHost(true);
        }
      });

      // Listen for visibility setting changes
      socket.on('visibilityChanged', (data: { showOpponentMoves: boolean }) => {
        setShowOpponentMoves(data.showOpponentMoves);
      });

      // Listen for pause state changes
      socket.on('gamePaused', (data: { paused: boolean; pausedBy: string }) => {
        setGamePaused(data.paused);
      });

      // Listen for chat messages
      socket.on('chatMessage', (data: { playerName: string; playerId: string; message: string; timestamp: string }) => {
        setChatMessages(prev => [...prev, data]);
      });

      // Connection error handler
      socket.on('connect_error', (error) => {
        setConnectionError('Failed to connect to game server');
        console.error('Socket connection error:', error);
      });

      return () => {
        socket.off('playerJoined');
        socket.off('playerReadyUpdate');
        socket.off('allPlayersReady');
        socket.off('gameStarted');
        socket.off('cardFlipped');
        socket.off('matchFound');
        socket.off('noMatch');
        socket.off('gameWon');
        socket.off('playerLeft');
        socket.off('newHost');
        socket.off('connect_error');
      };
    } else {
      // Disconnect socket if not in multiplayer mode
      if (socketRef.current) {
        disconnectSocket();
        socketRef.current = null;
      }
    }
  }, [gameMode, soundInitialized, difficulty]);

  // Check for room ID in URL params and auto-join
  useEffect(() => {
    const urlRoomId = searchParams?.get('roomId');
    if (urlRoomId && !roomId && !gameMode) {
      setRoomId(urlRoomId);
      setGameMode('multiplayer');
      setIsInLobby(true);
    }
  }, [searchParams, roomId, gameMode]);

  // Handle round completion and check for overall winner
  const handleRoundComplete = () => {
    // Determine round winner based on scores
    const winner = players[0].score > players[1].score ? 0 :
                   players[1].score > players[0].score ? 1 : null;

    if (winner !== null) {
      // Update round wins
      const newRoundWins = [...roundWins];
      newRoundWins[winner] += 1;
      setRoundWins(newRoundWins);
      setRoundWinner(winner);

      // Check if someone won the overall game (first to 4 rounds)
      if (newRoundWins[winner] >= 4) {
        setOverallWinner(winner);
        setGameWon(true);
      } else {
        // More rounds to play
        setGameWon(true); // Temporarily show round won state
      }
    }
  };

  // Start next round
  const handleNextRound = () => {
    setCurrentRound(prev => prev + 1);
    setRoundWinner(null);
    setGameWon(false);

    // Reset match state but preserve round wins
    const shuffledCards = shuffleCards(difficulty);
    setCards(shuffledCards);
    setFlippedCards([]);
    setMoves(0);
    setTimer(0);
    setCurrentPlayerIndex(0);

    // Reset player scores for new round
    const resetPlayers = players.map(p => ({ ...p, score: 0 }));
    setPlayers(resetPlayers);
  };

  const shuffleCards = (diff: Difficulty): Card[] => {
    // Determine how many unique cards we need based on difficulty
    const cardCounts = {
      easy: 4,    // 4 pairs = 8 cards
      medium: 8,  // 8 pairs = 16 cards
      hard: 12    // 12 pairs = 24 cards
    };
    const numPairs = cardCounts[diff];

    // Randomly select images from the large pool
    const shuffledPool = [...IMAGE_POOL].sort(() => Math.random() - 0.5);
    const selectedImages = shuffledPool.slice(0, numPairs);

    // Duplicate for pairs
    const duplicatedImages = [...selectedImages, ...selectedImages];

    // Shuffle the pairs
    const shuffled = duplicatedImages
      .sort(() => Math.random() - 0.5)
      .map((imageData, index) => ({
        id: index,
        iconName: imageData.name,
        Icon: imageData.Icon,
        imageUrl: imageData.imageUrl,
        color: imageData.color,
        isFlipped: false,
        isMatched: false,
      }));
    return shuffled;
  };

  const handleCardClick = (cardId: number) => {
    if (!gameStarted || !soundInitialized || gamePaused) return;

    // In single player mode, only allow clicks when it's player's turn (index 0)
    if (gameMode === 'single' && currentPlayerIndex !== 0) {
      return;
    }

    const card = cards.find(c => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched || flippedCards.length >= 2) {
      return;
    }

    // Play flip sound
    const soundManager = getSoundManager();
    soundManager.play('flip');

    // Flip the card
    const newFlippedCards = [...flippedCards, cardId];
    setFlippedCards(newFlippedCards);

    setCards(cards.map(c =>
      c.id === cardId ? { ...c, isFlipped: true } : c
    ));

    // Increment moves when second card is flipped
    if (newFlippedCards.length === 2) {
      setMoves(prev => prev + 1);
    }

    // Check for match when 2 cards are flipped
    if (newFlippedCards.length === 2) {
      const [firstId, secondId] = newFlippedCards;
      const firstCard = cards.find(c => c.id === firstId);
      const secondCard = cards.find(c => c.id === secondId);

      if (firstCard && secondCard && firstCard.iconName === secondCard.iconName) {
        // Match found
        setTimeout(() => {
          soundManager.play('match');
          setCards(cards.map(c =>
            c.id === firstId || c.id === secondId
              ? { ...c, isMatched: true }
              : c
          ));
          setFlippedCards([]);

          // Update score
          const updatedPlayers = [...players];
          if (updatedPlayers[currentPlayerIndex]) {
            updatedPlayers[currentPlayerIndex].score += 1;
            setPlayers(updatedPlayers);
          }

          // Check for round completion
          const allMatched = cards.every(c =>
            c.isMatched || c.id === firstId || c.id === secondId
          );
          if (allMatched) {
            setTimeout(() => {
              soundManager.play('win');

              // In multiplayer mode, complete the round
              if (gameMode === 'multiplayer') {
                handleRoundComplete();
              } else {
                // Single player mode - just end the game
                setGameWon(true);

                // Save best time
                if (!bestTime || timer < bestTime) {
                  localStorage.setItem(`joda-memory-best-${difficulty}`, timer.toString());
                  setBestTime(timer);
                }
              }
            }, 500);
          }
        }, 600);
      } else {
        // No match
        setTimeout(() => {
          soundManager.play('mismatch');
          setCards(cards.map(c =>
            c.id === firstId || c.id === secondId
              ? { ...c, isFlipped: false }
              : c
          ));
          setFlippedCards([]);

          // Switch turn only in multiplayer
          if (gameMode === 'multiplayer') {
            const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
            setCurrentPlayerIndex(nextPlayerIndex);

            setTimeout(() => {
              soundManager.play('turnChange');
            }, 300);
          }
        }, 1000);
      }
    }
  };

  // AI logic removed - single player is now solo challenge mode

  const handleModeSelect = (mode: 'single' | 'multiplayer') => {
    setGameMode(mode);

    // For single player mode, setup AI opponent
    if (mode === 'single') {
      setIsInLobby(false);
    } else {
      // For multiplayer, show name input instead of going directly to lobby
      setIsInLobby(false);
    }
  };

  const handleBackToMenu = () => {
    // Leave room if in one
    if (socketRef.current && roomId) {
      socketRef.current.emit('leaveRoom', { roomId });
    }

    // Disconnect socket if connected
    if (socketRef.current) {
      disconnectSocket();
      socketRef.current = null;
    }

    // Clear URL parameters
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('roomId');
      window.history.pushState({}, '', url.toString());
    }

    // Reset all game state in the correct order - important states first
    setIsInLobby(false);
    setGameStarted(false);
    setGameMode(null);
    setRoomId(null);
    setLobbyPlayers([]);
    setIsHost(false);
    setIsReady(false);
    setPlayerName('');
    setConnectionError(null);
    setPlayers([]);
    setCards([]);
    setFlippedCards([]);
    setCurrentPlayerIndex(0);
    setGameWon(false);
    setMoves(0);
    setTimer(0);

    // Reset round states
    setCurrentRound(1);
    setRoundWins([0, 0]);
    setRoundWinner(null);
    setOverallWinner(null);
  };

  const handleBackToMode = () => {
    setGameMode(null);
    setGameStarted(false);
    setIsInLobby(false);
  };

  const handleStartGame = (selectedDifficulty?: Difficulty) => {
    const diff = selectedDifficulty || difficulty;
    setDifficulty(diff);
    setGameStarted(true);
    setGameWon(false);
    setCurrentPlayerIndex(0);
    setMoves(0);
    setTimer(0);
    setIsAIThinking(false);
    const shuffled = shuffleCards(diff);
    setCards(shuffled);
    setFlippedCards([]);

    // Clear any saved game state when starting a new game
    localStorage.removeItem('joda-memory-game-state');

    // For single player, initialize just one player
    if (gameMode === 'single') {
      setPlayers([
        { name: 'You', score: 0, socketId: '' }
      ]);
    } else {
      // For multiplayer, reset existing player scores
      setPlayers(players.map(p => ({ ...p, score: 0 })));
    }
  };

  const handleRestart = () => {
    handleStartGame(difficulty);
  };

  // Multiplayer functions
  const handleCreateGame = async () => {
    if (!playerName.trim() || !socketRef.current) return;

    try {
      const socket = socketRef.current;
      socket.emit('createGame', { playerName: playerName.trim(), difficulty }, (response: any) => {
        if (response.success) {
          setRoomId(response.roomId);
          setIsInLobby(true);
          setIsHost(true);
          setLobbyPlayers(response.room.players);
          setShowOpponentMoves(response.room.showOpponentMoves);

          // Update URL with room ID
          const url = new URL(window.location.href);
          url.searchParams.set('roomId', response.roomId);
          window.history.pushState({}, '', url.toString());

          if (soundInitialized) {
            getSoundManager().play('start');
          }
        }
      });
    } catch (error) {
      console.error('Failed to create game:', error);
      setConnectionError('Failed to create game');
    }
  };

  const handleJoinGame = async () => {
    if (!playerName.trim() || !roomId || !socketRef.current) return;

    try {
      const socket = socketRef.current;
      socket.emit('joinGame', { roomId, playerName: playerName.trim() }, (response: any) => {
        if (response.success) {
          setIsInLobby(true);
          setIsHost(false);
          setLobbyPlayers(response.room.players);
          setShowOpponentMoves(response.room.showOpponentMoves);

          if (soundInitialized) {
            getSoundManager().play('match');
          }
        } else {
          setConnectionError(response.error || 'Failed to join game');
        }
      });
    } catch (error) {
      console.error('Failed to join game:', error);
      setConnectionError('Failed to join game');
    }
  };

  const handleToggleReady = () => {
    if (!socketRef.current || !roomId) return;

    const newReadyState = !isReady;
    setIsReady(newReadyState);

    socketRef.current.emit('playerReady', { roomId }, (response: any) => {
      if (!response.success) {
        setIsReady(!newReadyState); // Revert on failure
      }
    });
  };

  const handleMultiplayerStartGame = () => {
    if (!socketRef.current || !roomId || !isHost) return;

    const shuffledCards = shuffleCards(difficulty);
    const cardsData = shuffledCards.map(card => ({
      iconName: card.iconName,
    }));

    socketRef.current.emit('startGame', { roomId, cards: cardsData });
  };

  const handleSendMessage = () => {
    if (!chatInput.trim() || !socketRef.current || !roomId) return;

    socketRef.current.emit('sendChatMessage', {
      roomId,
      message: chatInput.trim()
    });

    setChatInput('');
  };

  const handleCopyRoomLink = () => {
    if (!roomId) return;

    const url = `${window.location.origin}${window.location.pathname}?roomId=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);

    if (soundInitialized) {
      getSoundManager().play('flip');
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentPlayer = players[currentPlayerIndex];
  const winner = gameWon
    ? players.reduce((prev, current) => prev.score > current.score ? prev : current)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8 relative overflow-hidden">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            radial-gradient(circle at 20% 50%, rgba(255,255,255,0.2) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 50%),
            radial-gradient(circle at 40% 20%, rgba(255,255,255,0.2) 0%, transparent 50%)
          `
        }}></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header with Logo */}
        <div className="relative text-center mb-8">
          {/* Back to Home Button - Top Left */}
          <button
            onClick={() => router.push('/')}
            className="absolute left-0 top-0 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-700/50 to-slate-600/50 hover:from-slate-600/60 hover:to-slate-500/60 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105 backdrop-blur-sm border border-white/10"
          >
            <Home className="w-5 h-5" />
            Home
          </button>

          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="relative">
              <Sparkles className="w-12 h-12 text-yellow-300 animate-pulse" />
              <Brain className="w-8 h-8 text-purple-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-pink-200 to-purple-200">
              Joda Memory
            </h1>
            <div className="relative">
              <Sparkles className="w-12 h-12 text-yellow-300 animate-pulse" />
              <Trophy className="w-8 h-8 text-yellow-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>
          <p className="text-white/90 text-xl font-semibold tracking-wide">
            ✨ Match the pairs to win! ✨
          </p>
        </div>

        {/* Game Controls */}
        <div className="flex justify-between items-center mb-4">
          {gameStarted && !gameWon ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const newPausedState = !gamePaused;
                  setGamePaused(newPausedState);

                  // Sync pause state in multiplayer
                  if (gameMode === 'multiplayer' && socketRef.current && roomId) {
                    socketRef.current.emit('togglePause', {
                      roomId,
                      paused: newPausedState
                    });
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500/30 hover:bg-yellow-500/40 text-yellow-100 rounded-lg font-semibold transition-all"
                title={gamePaused ? 'Resume' : 'Pause'}
              >
                {gamePaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                <span>{gamePaused ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                onClick={handleBackToMode}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/30 hover:bg-blue-500/40 text-blue-100 rounded-lg font-semibold transition-all"
                title="Main Menu"
              >
                <Home className="w-5 h-5" />
                <span>Menu</span>
              </button>
              <button
                onClick={handleBackToMenu}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/30 hover:bg-red-500/40 text-red-100 rounded-lg font-semibold transition-all"
                title="Quit Game"
              >
                <LogOut className="w-5 h-5" />
                <span>Quit</span>
              </button>
            </div>
          ) : (
            <div></div>
          )}
          <SoundControls />
        </div>

        {/* Game Stats Bar */}
        {gameStarted && (
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-6">
            {/* Round Counter for Multiplayer */}
            {gameMode === 'multiplayer' && (
              <div className="text-center mb-4 pb-4 border-b border-white/20">
                <div className="text-sm text-white/70 mb-2">Current Round</div>
                <div className="text-5xl font-bold text-yellow-300">{currentRound}</div>
                <div className="text-sm text-white/60 mt-1">First to 4 rounds wins!</div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <div>
                <div className="text-sm text-white/70 mb-1">Time</div>
                <div className="text-3xl font-bold text-white">{formatTime(timer)}</div>
              </div>
              <div>
                <div className="text-sm text-white/70 mb-1">Moves</div>
                <div className="text-3xl font-bold text-white">{moves}</div>
              </div>
              <div>
                <div className="text-sm text-white/70 mb-1">{gameMode === 'multiplayer' ? 'Round Score' : 'Best Time'}</div>
                <div className="text-3xl font-bold text-white">
                  {gameMode === 'multiplayer' ? `${roundWins[0]} - ${roundWins[1]}` : (bestTime ? formatTime(bestTime) : '--:--')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Player Stats */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {players.map((player, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg transition-all ${
                  index === currentPlayerIndex && gameStarted && !gameWon
                    ? 'bg-yellow-400/30 ring-2 ring-yellow-400'
                    : 'bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {player.name}
                      {index === currentPlayerIndex && gameStarted && !gameWon && (
                        <span className="ml-2 text-sm">
                          {index === 0 ? '👈 Your turn!' : gameMode === 'single' ? '🤖 AI turn' : '⏳ Their turn'}
                        </span>
                      )}
                    </h3>
                    {player.isGuest && (
                      <span className="text-xs text-white/60">Guest Player</span>
                    )}
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-white">
                      {player.score}
                    </div>
                    {gameMode === 'multiplayer' && (
                      <div className="text-sm text-white/70 text-right">
                        Rounds: {roundWins[index]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Win Message */}
          {gameWon && winner && (
            <div className="text-center p-6 bg-green-500/30 rounded-lg">
              {gameMode === 'multiplayer' && overallWinner !== null ? (
                // Overall game winner
                <>
                  <h2 className="text-4xl font-bold text-white mb-4">
                    🏆 {players[overallWinner].name} Wins the Game! 🏆
                  </h2>
                  <p className="text-white/90 text-xl mb-2">
                    Overall Score: {roundWins[overallWinner]} - {roundWins[overallWinner === 0 ? 1 : 0]}
                  </p>
                  <p className="text-white/80">
                    Won {roundWins[overallWinner]} out of {currentRound} rounds
                  </p>
                </>
              ) : gameMode === 'multiplayer' && roundWinner !== null ? (
                // Round winner
                <>
                  <h2 className="text-3xl font-bold text-white mb-3">
                    🎉 {players[roundWinner].name} Won Round {currentRound}! 🎉
                  </h2>
                  <p className="text-white/90 mb-3">
                    Round Score: {roundWinner !== null && players[roundWinner] ? `${players[roundWinner].score} - ${players[roundWinner === 0 ? 1 : 0].score}` : ''} pairs
                  </p>
                  <p className="text-white/90 text-lg mb-4">
                    Overall Score: {roundWins[0]} - {roundWins[1]}
                  </p>
                  <button
                    onClick={handleNextRound}
                    className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold rounded-lg shadow-lg transition-all hover:scale-105"
                  >
                    Next Round →
                  </button>
                </>
              ) : (
                // Single player victory
                <>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    🎉 Round Complete! 🎉
                  </h2>
                  <p className="text-white/80 mb-2">
                    Score: {winner.score} pairs
                  </p>
                  <p className="text-white/80 mb-4">
                    Time: {formatTime(timer)} | Moves: {moves}
                  </p>
                  {timer === bestTime && (
                    <p className="text-yellow-300 font-bold mb-4">
                      ⭐ New Best Time! ⭐
                    </p>
                  )}
                  <button
                    onClick={handleNextRound}
                    className="mt-4 px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2 mx-auto"
                  >
                    <Sparkles className="w-5 h-5" />
                    Next Round →
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Game Board */}
        {!gameMode || (!gameStarted && !isInLobby && gameMode === 'multiplayer' && !roomId) ? (
          <div className="text-center py-10">
            <h2 className="text-4xl font-bold text-white mb-10 flex items-center justify-center gap-3">
              <Gamepad2 className="w-10 h-10 text-yellow-300" />
              Select Game Mode
              <Gamepad2 className="w-10 h-10 text-yellow-300" />
            </h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-8">
              <button
                onClick={() => handleModeSelect('single')}
                className="group relative bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm border-2 border-blue-400/40 hover:border-blue-300 rounded-3xl p-12 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/50"
              >
                <div className="absolute top-4 right-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <Zap className="w-16 h-16 text-blue-300" />
                </div>
                <div className="mb-6 relative">
                  <div className="inline-block relative">
                    <Bot className="w-24 h-24 text-blue-300 group-hover:text-blue-200 transition-colors" strokeWidth={1.5} />
                    <Sparkles className="w-8 h-8 text-yellow-300 absolute -top-2 -right-2 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-4xl font-black text-white mb-4 group-hover:text-blue-100 transition-colors">
                  Single Player
                </h3>
                <p className="text-white/80 text-xl mb-2 font-semibold">Play against AI</p>
                <p className="text-white/60 text-sm">Challenge the computer opponent</p>
                <div className="mt-6 flex items-center justify-center gap-2 text-blue-200">
                  <Brain className="w-5 h-5" />
                  <span className="text-sm font-medium">Smart AI Opponent</span>
                </div>
              </button>

              <button
                onClick={() => handleModeSelect('multiplayer')}
                className="group relative bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm border-2 border-purple-400/40 hover:border-purple-300 rounded-3xl p-12 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
              >
                <div className="absolute top-4 right-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <Heart className="w-16 h-16 text-pink-300" />
                </div>
                <div className="mb-6 relative">
                  <div className="inline-block relative">
                    <Users className="w-24 h-24 text-purple-300 group-hover:text-purple-200 transition-colors" strokeWidth={1.5} />
                    <Sparkles className="w-8 h-8 text-yellow-300 absolute -top-2 -right-2 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-4xl font-black text-white mb-4 group-hover:text-purple-100 transition-colors">
                  Multiplayer
                </h3>
                <p className="text-white/80 text-xl mb-2 font-semibold">Play with a friend</p>
                <p className="text-white/60 text-sm">Local two-player mode</p>
                <div className="mt-6 flex items-center justify-center gap-2 text-purple-200">
                  <Heart className="w-5 h-5" />
                  <span className="text-sm font-medium">2-Player Local Mode</span>
                </div>
              </button>
            </div>
          </div>
        ) : !gameStarted ? (
          gameMode === 'multiplayer' && !isInLobby ? (
            /* Multiplayer Name Input */
            <div className="text-center py-10 max-w-md mx-auto">
              <h2 className="text-3xl font-bold text-white mb-8">Enter Your Name</h2>

              {connectionError && (
                <div className="bg-red-500/20 border-2 border-red-400 rounded-lg p-6 mb-6">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <X className="w-8 h-8 text-red-300" />
                    <h3 className="text-2xl font-bold text-red-200">
                      {connectionError.includes('full') || connectionError.includes('expired') ? 'Link Expired' : 'Error'}
                    </h3>
                  </div>
                  <p className="text-red-200 text-center">{connectionError}</p>
                  <button
                    onClick={() => {
                      setConnectionError(null);
                      setRoomId(null);
                      setGameMode(null);
                    }}
                    className="mt-4 px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-semibold transition-colors mx-auto block"
                  >
                    Back to Menu
                  </button>
                </div>
              )}

              <div className="bg-white/10 backdrop-blur-sm border-2 border-purple-400/40 rounded-2xl p-8 mb-6">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  className="w-full px-4 py-3 bg-white/20 border-2 border-white/30 rounded-lg text-white placeholder-white/50 text-center text-xl font-semibold focus:outline-none focus:border-purple-400 transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && playerName.trim()) {
                      if (roomId) {
                        handleJoinGame();
                      } else {
                        handleCreateGame();
                      }
                    }
                  }}
                />

                <div className="mt-6 grid grid-cols-2 gap-4">
                  {!roomId && (
                    <button
                      onClick={handleCreateGame}
                      disabled={!playerName.trim()}
                      className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Create Game
                    </button>
                  )}
                  {roomId && (
                    <button
                      onClick={handleJoinGame}
                      disabled={!playerName.trim()}
                      className="col-span-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Join Game
                    </button>
                  )}
                  <button
                    onClick={handleBackToMode}
                    className="col-span-full px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-lg font-semibold hover:bg-white/30 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          ) : gameMode === 'multiplayer' && isInLobby ? (
            /* Multiplayer Lobby */
            <div className="text-center py-10 max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold text-white mb-8">Game Lobby</h2>

              {/* Room Code */}
              <div className="bg-white/10 backdrop-blur-sm border-2 border-purple-400/40 rounded-2xl p-6 mb-6">
                <p className="text-white/70 mb-2">Room Code</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-4xl font-black text-white tracking-widest">{roomId}</span>
                  <button
                    onClick={handleCopyRoomLink}
                    className="p-3 bg-purple-500/30 hover:bg-purple-500/40 rounded-lg transition-colors"
                    title="Copy room link"
                  >
                    {copiedLink ? <Check className="w-6 h-6 text-green-300" /> : <Copy className="w-6 h-6 text-white" />}
                  </button>
                </div>
                {copiedLink && <p className="text-green-300 text-sm mt-2">Link copied to clipboard!</p>}
              </div>

              {/* Players List */}
              <div className="bg-white/10 backdrop-blur-sm border-2 border-purple-400/40 rounded-2xl p-6 mb-6">
                <h3 className="text-xl font-bold text-white mb-4">Players ({lobbyPlayers.length}/2)</h3>
                <div className="space-y-3">
                  {lobbyPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between bg-white/5 rounded-lg p-4"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="w-6 h-6 text-purple-300" />
                        <span className="text-white font-semibold">{player.name}</span>
                        {player.isHost && (
                          <span className="text-xs bg-yellow-500/30 text-yellow-200 px-2 py-1 rounded">HOST</span>
                        )}
                      </div>
                      <div>
                        {player.isReady ? (
                          <span className="text-green-300 font-semibold">✓ Ready</span>
                        ) : (
                          <span className="text-white/50">Not Ready</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {lobbyPlayers.length < 2 && (
                    <div className="flex items-center justify-center bg-white/5 rounded-lg p-4 border-2 border-dashed border-white/20">
                      <span className="text-white/50">Waiting for another player...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Game Settings - Visibility Toggle */}
              <div className="bg-white/10 backdrop-blur-sm border-2 border-purple-400/40 rounded-2xl p-6 mb-6">
                <h3 className="text-xl font-bold text-white mb-4">Game Settings</h3>
                <div className="flex items-center justify-between bg-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    {showOpponentMoves ? <Eye className="w-6 h-6 text-green-300" /> : <EyeOff className="w-6 h-6 text-red-300" />}
                    <div className="text-left">
                      <p className="text-white font-semibold">Opponent Card Visibility</p>
                      <p className="text-white/60 text-sm">
                        {showOpponentMoves ? 'Cards shown during opponent turn' : 'Cards hidden during opponent turn'}
                      </p>
                    </div>
                  </div>
                  {isHost ? (
                    <button
                      onClick={() => {
                        const newValue = !showOpponentMoves;
                        setShowOpponentMoves(newValue);
                        if (socketRef.current && roomId) {
                          socketRef.current.emit('toggleOpponentMoves', { roomId, showOpponentMoves: newValue });
                        }
                      }}
                      className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                        showOpponentMoves
                          ? 'bg-green-500/30 text-green-100 hover:bg-green-500/40'
                          : 'bg-red-500/30 text-red-100 hover:bg-red-500/40'
                      }`}
                    >
                      {showOpponentMoves ? 'Showing' : 'Hidden'}
                    </button>
                  ) : (
                    <span className={`px-6 py-2 rounded-lg font-semibold ${
                      showOpponentMoves ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'
                    }`}>
                      {showOpponentMoves ? 'Showing' : 'Hidden'}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleToggleReady}
                  disabled={lobbyPlayers.length < 2}
                  className={`px-8 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isReady
                      ? 'bg-red-500/30 text-red-100 hover:bg-red-500/40'
                      : 'bg-green-500/30 text-green-100 hover:bg-green-500/40'
                  }`}
                >
                  {isReady ? 'Not Ready' : 'Ready'}
                </button>

                {isHost && (
                  <button
                    onClick={handleMultiplayerStartGame}
                    disabled={!lobbyPlayers.every(p => p.isReady) || lobbyPlayers.length < 2}
                    className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Game
                  </button>
                )}

                <button
                  onClick={handleBackToMenu}
                  className="px-8 py-3 bg-white/20 backdrop-blur-sm text-white rounded-lg font-semibold hover:bg-white/30 transition-colors"
                >
                  Leave Lobby
                </button>
              </div>
            </div>
          ) : (
            /* Single Player Difficulty Selection */
            <div className="text-center py-10">
              <h2 className="text-3xl font-bold text-white mb-8">Select Difficulty</h2>
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <button
                  onClick={() => handleStartGame('easy')}
                  className="group relative bg-white/10 backdrop-blur-sm border-2 border-white/20 hover:border-green-400/60 rounded-2xl p-8 transition-all hover:scale-105"
                >
                  <div className="text-6xl mb-4">🟢</div>
                  <h3 className="text-2xl font-bold text-white mb-2">Easy</h3>
                  <p className="text-white/70">8 cards (4 pairs)</p>
                  <p className="text-white/60 text-sm mt-2">Perfect for beginners</p>
                </button>

                <button
                  onClick={() => handleStartGame('medium')}
                  className="group relative bg-white/10 backdrop-blur-sm border-2 border-yellow-400/60 hover:border-yellow-400 rounded-2xl p-8 transition-all hover:scale-105"
                >
                  <div className="text-6xl mb-4">🟡</div>
                  <h3 className="text-2xl font-bold text-white mb-2">Medium</h3>
                  <p className="text-white/70">16 cards (8 pairs)</p>
                  <p className="text-white/60 text-sm mt-2">Good challenge</p>
                </button>

                <button
                  onClick={() => handleStartGame('hard')}
                  className="group relative bg-white/10 backdrop-blur-sm border-2 border-red-400/60 hover:border-red-400 rounded-2xl p-8 transition-all hover:scale-105"
                >
                  <div className="text-6xl mb-4">🔴</div>
                  <h3 className="text-2xl font-bold text-white mb-2">Hard</h3>
                  <p className="text-white/70">24 cards (12 pairs)</p>
                  <p className="text-white/60 text-sm mt-2">Expert level</p>
                </button>
              </div>

              <button
                onClick={handleBackToMode}
                className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-lg font-semibold
                         hover:bg-white/30 transition-colors"
              >
                Back to Mode Selection
              </button>
            </div>
          )
        ) : (
          <>
            <div className={`grid gap-3 mb-6 max-w-4xl mx-auto relative`} style={{ gridTemplateColumns: `repeat(${GRID_COLS[difficulty]}, minmax(0, 1fr))` }}>
              {/* Overlay when it's not your turn AND visibility is disabled */}
              {currentPlayerIndex !== 0 && !showOpponentMoves && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-10 rounded-xl flex items-center justify-center">
                  <div className="bg-gradient-to-br from-white to-gray-50 px-10 py-8 rounded-2xl shadow-2xl text-center border-4 border-purple-200">
                    {gameMode === 'single' ? (
                      <>
                        <div className="mb-4 flex justify-center">
                          <div className="relative">
                            <Bot className="w-20 h-20 text-blue-500 animate-pulse" strokeWidth={1.5} />
                            <Brain className="w-8 h-8 text-purple-500 absolute -top-2 -right-2 animate-bounce" />
                          </div>
                        </div>
                        <h3 className="text-3xl font-black text-gray-800 mb-3 flex items-center justify-center gap-2">
                          <Zap className="w-6 h-6 text-yellow-500" />
                          Computer Thinking
                          <Zap className="w-6 h-6 text-yellow-500" />
                        </h3>
                        <p className="text-gray-600 font-medium">AI is making its move...</p>
                      </>
                    ) : (
                      <>
                        <div className="mb-4 flex justify-center">
                          <Clock className="w-20 h-20 text-purple-500 animate-spin" strokeWidth={1.5} style={{ animationDuration: '3s' }} />
                        </div>
                        <h3 className="text-3xl font-black text-gray-800 mb-3">Waiting for Player 2</h3>
                        <p className="text-gray-600 font-medium">It's their turn to play...</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Pause Overlay */}
              {gamePaused && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-20 rounded-xl flex items-center justify-center">
                  <div className="bg-gradient-to-br from-white to-gray-50 px-12 py-10 rounded-2xl shadow-2xl text-center border-4 border-yellow-200">
                    <div className="mb-4 flex justify-center">
                      <Pause className="w-24 h-24 text-yellow-500" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-4xl font-black text-gray-800 mb-4">Game Paused</h3>
                    <p className="text-gray-600 font-medium mb-6">Click Resume to continue playing</p>
                    <button
                      onClick={() => {
                        setGamePaused(false);

                        // Sync resume in multiplayer
                        if (gameMode === 'multiplayer' && socketRef.current && roomId) {
                          socketRef.current.emit('togglePause', {
                            roomId,
                            paused: false
                          });
                        }
                      }}
                      className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold rounded-lg shadow-lg transition-all hover:scale-105 flex items-center gap-2 mx-auto"
                    >
                      <Play className="w-5 h-5" />
                      Resume Game
                    </button>
                  </div>
                </div>
              )}

              {cards.map((card) => (
                <div
                  key={card.id}
                  className={`relative transition-all duration-500 ${
                    card.isMatched ? 'opacity-0 scale-0' : ''
                  }`}
                  style={{
                    perspective: '1000px',
                    aspectRatio: '1'
                  }}
                >
                  <button
                    onClick={() => handleCardClick(card.id)}
                    disabled={card.isMatched || card.isFlipped || currentPlayerIndex !== 0}
                    className={`relative w-full h-full ${
                      currentPlayerIndex === 0 && !card.isMatched && !card.isFlipped
                        ? 'cursor-pointer'
                        : showOpponentMoves && currentPlayerIndex !== 0
                        ? 'cursor-default'
                        : 'cursor-not-allowed'
                    }`}
                    style={{
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.6s',
                      transform: card.isFlipped || card.isMatched ? 'rotateY(180deg)' : 'rotateY(0deg)'
                    }}
                  >
                    {/* Card Back */}
                    <div
                      className="absolute inset-0 rounded-xl flex items-center justify-center overflow-hidden shadow-2xl"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(0deg)'
                      }}
                    >
                      {/* Multi-layer gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600"></div>
                      <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/50 via-transparent to-pink-500/50"></div>

                      {/* Geometric pattern overlay */}
                      <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: `
                          repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px),
                          repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)
                        `,
                      }}></div>

                      {/* Center icon */}
                      <div className="relative z-10">
                        <div className="relative">
                          <Sparkles className="w-12 h-12 text-yellow-200 animate-pulse" strokeWidth={2} />
                          <Brain className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" strokeWidth={2.5} />
                        </div>
                      </div>

                      {/* Decorative corners */}
                      <div className="absolute top-2 left-2">
                        <Star className="w-4 h-4 text-yellow-200/60" fill="currentColor" />
                      </div>
                      <div className="absolute top-2 right-2">
                        <Star className="w-4 h-4 text-yellow-200/60" fill="currentColor" />
                      </div>
                      <div className="absolute bottom-2 left-2">
                        <Star className="w-4 h-4 text-yellow-200/60" fill="currentColor" />
                      </div>
                      <div className="absolute bottom-2 right-2">
                        <Star className="w-4 h-4 text-yellow-200/60" fill="currentColor" />
                      </div>

                      {/* Border glow */}
                      <div className="absolute inset-0 border-2 border-white/30 rounded-xl"></div>
                      <div className="absolute inset-0 border border-yellow-200/20 rounded-xl"></div>
                    </div>

                    {/* Card Front */}
                    <div
                      className="absolute inset-0 rounded-xl overflow-hidden shadow-2xl"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)'
                      }}
                    >
                      {/* Beautiful Image */}
                      {card.imageUrl ? (
                        <div className="relative w-full h-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={card.imageUrl}
                            alt={card.iconName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to icon on image load error
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          {/* Fallback Icon Container (hidden by default) */}
                          <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50 to-gray-100 items-center justify-center hidden">
                            <div className="relative flex items-center justify-center">
                              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} rounded-full blur-2xl opacity-40 scale-150`}></div>
                              <div className={`relative p-6 rounded-2xl bg-gradient-to-br ${card.color} shadow-xl`}>
                                <card.Icon
                                  className={`${
                                    difficulty === 'hard'
                                      ? 'w-12 h-12'
                                      : difficulty === 'medium'
                                      ? 'w-14 h-14'
                                      : 'w-16 h-16'
                                  } text-white drop-shadow-lg`}
                                  strokeWidth={2}
                                />
                              </div>
                            </div>
                          </div>
                          {/* Subtle overlay for better card visibility */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-black/10 pointer-events-none"></div>
                          {/* Border glow */}
                          <div className={`absolute inset-0 border-2 bg-gradient-to-br ${card.color} rounded-xl opacity-30`} style={{ WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', padding: '2px' }}></div>
                        </div>
                      ) : (
                        // Fallback to icon if no image URL
                        <div className="relative w-full h-full bg-gradient-to-br from-white via-gray-50 to-gray-100 flex items-center justify-center">
                          <div className="relative flex items-center justify-center">
                            <div className={`absolute inset-0 bg-gradient-to-br ${card.color} rounded-full blur-2xl opacity-40 scale-150`}></div>
                            <div className={`relative p-6 rounded-2xl bg-gradient-to-br ${card.color} shadow-xl`}>
                              <card.Icon
                                className={`${
                                  difficulty === 'hard'
                                    ? 'w-12 h-12'
                                    : difficulty === 'medium'
                                    ? 'w-14 h-14'
                                    : 'w-16 h-16'
                                } text-white drop-shadow-lg`}
                                strokeWidth={2}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>

            <div className="text-center">
              <button
                onClick={handleRestart}
                className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2 mx-auto"
              >
                <RotateCcw className="w-5 h-5" />
                Restart Game
              </button>
            </div>
          </>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-3">How to Play:</h3>
          <ul className="text-white/80 space-y-2">
            <li>🎯 Click on cards to flip them and reveal the emoji</li>
            <li>🎮 Find matching pairs of emojis</li>
            <li>🔄 Take turns with your opponent</li>
            <li>⏱️ Complete the game in the shortest time possible</li>
            <li>🏆 The player with the most pairs wins!</li>
            <li>🔊 Enjoy the sound effects as you play!</li>
          </ul>
        </div>
      </div>

      {/* Invite Player Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
            {/* Close button */}
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="text-center mb-6">
              <div className="mb-4 flex justify-center">
                <Users className="w-20 h-20 text-purple-500" strokeWidth={1.5} />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Invite Player</h2>
              <p className="text-gray-600">Share this link with your friend to play together!</p>
            </div>

            <div className="bg-gray-100 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">Game Link:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== 'undefined' ? `${window.location.href}?gameId=placeholder123` : 'Loading...'}
                  className="flex-1 bg-white px-4 py-3 rounded-lg text-gray-800 border border-gray-300 text-sm"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => {
                    const gameLink = typeof window !== 'undefined' ? `${window.location.href}?gameId=placeholder123` : '';
                    navigator.clipboard.writeText(gameLink);
                    // Show copy success feedback
                    const btn = document.activeElement as HTMLButtonElement;
                    if (btn) {
                      const originalText = btn.innerHTML;
                      btn.innerHTML = '✓';
                      btn.classList.add('bg-green-500');
                      setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.classList.remove('bg-green-500');
                      }, 2000);
                    }
                  }}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition flex-shrink-0"
                >
                  📋 Copy
                </button>
              </div>
            </div>

            <div className="text-sm text-gray-500 mb-6">
              <p>💡 <strong>Note:</strong> Once your friend opens this link, they'll join your game and you can start playing together!</p>
            </div>

            <button
              onClick={() => setShowInviteModal(false)}
              className="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Floating Chat - Only show in multiplayer when game has started */}
      {gameMode === 'multiplayer' && gameStarted && (
        <div className="fixed bottom-4 right-4 z-50">
          {showChat ? (
            /* Expanded Chat Window */
            <div className="bg-white/10 backdrop-blur-md border-2 border-purple-400/40 rounded-2xl shadow-2xl w-80 h-96 flex flex-col">
              {/* Chat Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/20">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-300" />
                  <h3 className="text-white font-semibold">Chat</h3>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Messages List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {chatMessages.length === 0 ? (
                  <p className="text-white/50 text-sm text-center">No messages yet...</p>
                ) : (
                  chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.playerId === socketRef.current?.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[70%] rounded-lg p-2 ${
                        msg.playerId === socketRef.current?.id
                          ? 'bg-purple-500/30 text-white'
                          : 'bg-white/20 text-white'
                      }`}>
                        <p className="text-xs font-semibold mb-1">{msg.playerName}</p>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-white/20">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 bg-white/10 text-white placeholder-white/50 rounded-lg border border-white/20 focus:outline-none focus:border-purple-400"
                    maxLength={200}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim()}
                    className="px-4 py-2 bg-purple-500/30 hover:bg-purple-500/40 disabled:bg-white/10 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Minimized Chat Button */
            <button
              onClick={() => setShowChat(true)}
              className="bg-purple-500/30 hover:bg-purple-500/40 backdrop-blur-md border-2 border-purple-400/40 rounded-full p-4 shadow-lg transition-all hover:scale-110"
            >
              <MessageSquare className="w-6 h-6 text-white" />
              {chatMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {chatMessages.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
