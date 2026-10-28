'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSoundManager } from '../lib/sounds/soundManager';
import SoundControls from './SoundControls';
import SiteHeader from './ui/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { clearCurrentRoom, saveCurrentRoom } from '../lib/currentRoom';
import OnlinePlayers, { type InviteRoom } from './OnlinePlayers';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import {
  Gamepad2, Dices, Target, Palette, Drama, Film, Mic,
  Piano, Guitar, Music, Disc, Sparkles, Crown, Trophy, Star,
  Heart, Diamond, Zap, Rocket, Bot, Users, Clock, RotateCcw,
  ArrowLeft, Volume2, Brain, X, Eye, EyeOff, Copy, Check, Link2,
  Pause, Play, Home, LogOut, MessageSquare, Send, Gem, Flame,
  Cherry, Cpu, Puzzle, Sword, Wand2, Smile, Ghost, Coffee,
  Cake, PartyPopper, Gift, Sparkle, User, Globe, Swords
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
  isGuest?: boolean;
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
  // Multiplayer: who paused (player id + name); only they can resume
  const [pauseOwner, setPauseOwner] = useState<{ id: string; name: string } | null>(null);
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
  // This client's seat in `players`; turns are compared against it instead of assuming seat 0
  const [myPlayerIndex, setMyPlayerIndex] = useState(0);
  const [roundTied, setRoundTied] = useState(false);
  // Name of the player who just left, and whether that ended a game in progress
  const [playerLeftNotice, setPlayerLeftNotice] = useState<{ name: string; duringGame: boolean; forfeit: boolean; reachedRound: number } | null>(null);
  const { user, refreshSession } = useAuth();
  // Online lobby: browse players who aren't in a room and send/receive game requests
  const [showOnline, setShowOnline] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [incomingInvite, setIncomingInvite] = useState<{ inviteId: string; fromName: string; expiresAt: number } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNow, setInviteNow] = useState(() => Date.now());
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  // Name of the other player while their connection is down and the server is holding their seat
  const [waitingForName, setWaitingForName] = useState<string | null>(null);
  // Read by the socket 'connect' listener, which outlives renders, to decide whether to rejoin a room
  const rejoinRef = useRef<{ roomId: string | null; inRoom: boolean }>({ roomId: null, inRoom: false });
  const [soloSave, setSoloSave] = useState<
    | { status: 'saving' | 'signed-out' | 'error' }
    | { status: 'saved'; personalBest: boolean; rank: number | null }
    | null
  >(null);
  // Flips arrive over the socket; the listener calls the latest applyFlip through this ref to avoid stale state
  const applyFlipRef = useRef<(cardId: number) => void>(() => {});
  const roundsDealtRef = useRef(0);

  const isMyTurn = gameMode === 'multiplayer' ? currentPlayerIndex === myPlayerIndex : currentPlayerIndex === 0;
  // Solo can always resume; in multiplayer only the player who paused
  const canResume = gameMode !== 'multiplayer' || !pauseOwner || pauseOwner.id === players[myPlayerIndex]?.id;

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
    if (gameStarted && !gameWon && isMyTurn && soundInitialized) {
      // Don't play on initial turn
      if (moves > 0) {
        const soundManager = getSoundManager();
        soundManager.play('myTurn');
      }
    }
    // Note: AI turn (currentPlayerIndex === 1 in single mode) does not play myTurn sound
  }, [currentPlayerIndex, isMyTurn, gameStarted, gameWon, soundInitialized, moves]);

  // Remember the room while we're in it, so stepping out (back, refresh, menu, another page) offers a way back
  const inRoomNow = gameMode === 'multiplayer' && Boolean(roomId) && (isInLobby || gameStarted);
  useEffect(() => {
    if (!inRoomNow || !roomId) return;
    saveCurrentRoom(roomId);
    const refresh = setInterval(() => saveCurrentRoom(roomId), 20000);
    return () => clearInterval(refresh);
  }, [inRoomNow, roomId]);

  // Being listed as online: whenever this page is open and we're not in a room (debounced while typing a name)
  const onlineName = (playerName.trim() || (user && !isDefaultGuestName(user.name) ? user.name : '') || user?.name || '').slice(0, 20);
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const send = () => socket.emit('presence:update', { available: !inRoomNow, name: onlineName || undefined, playerKey: getPlayerKey() }, () => {});
    const timer = setTimeout(() => { if (socket.connected) send(); }, 400);
    socket.on('connect', send);
    return () => {
      clearTimeout(timer);
      socket.off('connect', send);
    };
  }, [inRoomNow, onlineName, gameMode]);

  // Countdown on an incoming request
  useEffect(() => {
    if (!incomingInvite) return;
    const timer = setInterval(() => setInviteNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [incomingInvite]);

  // Start the room name field with the account's chosen name, but not an auto-generated guest one
  useEffect(() => {
    if (user && !playerName && !isDefaultGuestName(user.name)) setPlayerName(user.name);
  }, [user]);

  // Save a cleared solo board once, with the same time and move count the win dialog shows
  useEffect(() => {
    if (gameWon && gameStarted && gameMode === 'single' && soloSave === null) {
      saveSoloRun(timer, moves);
    }
    // Only react to the win itself; timer/moves are read at that moment
  }, [gameWon]);

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

  // One socket for the whole Joda Memory page: rooms, and being listed as online when not in a room
  useEffect(() => {
    socketRef.current = connectSocket();
    const socket = socketRef.current;

    // Listen for player joined
    socket.on('playerJoined', (data: { player: LobbyPlayer; players: LobbyPlayer[] }) => {
      setLobbyPlayers(data.players);
      setPlayerLeftNotice(null);
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
    socket.on('gameStarted', (data: { cards: any[]; currentPlayerIndex: number; players: Player[]; difficulty?: Difficulty }) => {
      // Both players lay out the board for the deck the server dealt (24 cards needs the wider grid)
      if (data.difficulty) setDifficulty(data.difficulty);
      const mappedCards: Card[] = data.cards.map((card: any, index: number) => {
        const imageData = IMAGE_POOL.find(img => img.name === card.iconName);
        return {
          id: index,
          iconName: card.iconName,
          Icon: imageData?.Icon || Gamepad2,
          imageUrl: imageData?.imageUrl,
          color: imageData?.color || 'from-slate-400 to-gray-600',
          isFlipped: false,
          isMatched: false,
        };
      });

      setCards(mappedCards);
      setPlayers(data.players);
      setMyPlayerIndex(Math.max(0, data.players.findIndex(p => p.socketId === socket.id)));
      setCurrentPlayerIndex(data.currentPlayerIndex);
      setFlippedCards([]);
      setRoundWinner(null);
      setRoundTied(false);
      setPlayerLeftNotice(null);
      setGamePaused(false);
      setPauseOwner(null);
      // Every deal from the host after the first one is a new round
      roundsDealtRef.current += 1;
      setCurrentRound(roundsDealtRef.current);
      setGameStarted(true);
      setIsInLobby(false);
      setTimer(0);
      setMoves(0);
      setGameWon(false);

      if (soundInitialized) {
        getSoundManager().play('myTurn');
      }
    });

    // Listen for card flipped
    // The server relays every flip to the whole room, including the player who flipped,
    // so both boards apply the same flips in the same order and stay identical
    socket.on('cardFlipped', (data: { cardId: number; playerId: string }) => {
      applyFlipRef.current(data.cardId);
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
    socket.on('playerLeft', (data: { playerId: string; playerName?: string; players: LobbyPlayer[]; gameInProgress?: boolean; forfeit?: boolean }) => {
      setLobbyPlayers(data.players);
      if (data.players.length === 0) {
        handleBackToMenu();
        return;
      }
      setWaitingForName(null);
      setPlayerLeftNotice({ name: data.playerName || 'Your friend', duringGame: Boolean(data.gameInProgress), forfeit: Boolean(data.forfeit), reachedRound: roundsDealtRef.current });
      if (data.gameInProgress) {
        // The server abandons the game and puts the room back in the lobby; mirror that here
        setGameStarted(false);
        setGameWon(false);
        setGamePaused(false);
        setPauseOwner(null);
        setIsInLobby(true);
        setIsReady(false);
        setRoundWinner(null);
        setOverallWinner(null);
        setRoundTied(false);
        setRoundWins([0, 0]);
        setCurrentRound(1);
        roundsDealtRef.current = 0;
        setCards([]);
        setFlippedCards([]);
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
    socket.on('gamePaused', (data: { paused: boolean; pausedBy: string; pausedById?: string; pausedByName?: string }) => {
      setGamePaused(data.paused);
      setPauseOwner(data.paused && data.pausedById ? { id: data.pausedById, name: data.pausedByName || 'Your friend' } : null);
    });

    // Listen for chat messages
    socket.on('chatMessage', (data: { playerName: string; playerId: string; message: string; timestamp: string }) => {
      setChatMessages(prev => [...prev, data]);
    });

    // Phones drop the socket when the app is backgrounded, and people reload or reopen the link; the server
    // holds our seat for a while, so on every connect we try to take it back and resync from the server's copy
    const attemptRejoin = () => {
      const { roomId: currentRoomId, inRoom } = rejoinRef.current;
      if (!currentRoomId) return;
      socket.emit('rejoinRoom', { roomId: currentRoomId, playerKey: getPlayerKey() }, (response: RejoinResponse) => {
        if (response?.success) {
          applyReclaimedSeat(response, socket.id);
          return;
        }
        // Opening a link we have no seat in: stay on the join step (and forget a room that no longer exists)
        if (!inRoom) {
          if (response && !response.success && /not found/i.test(response.error ?? '')) clearCurrentRoom();
          return;
        }
        clearCurrentRoom();
        // The seat expired: drop back to the name step with an explanation instead of a dead lobby
        setGameStarted(false);
        setIsInLobby(false);
        setRoomId(null);
        setLobbyPlayers([]);
        setIsHost(false);
        setIsReady(false);
        setWaitingForName(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('roomId');
        window.history.replaceState({}, '', url.toString());
        setConnectionError('Room not found');
      });
    };
    socket.on('connect', attemptRejoin);
    // Coming back from another page within the site: the socket never dropped, so there is no 'connect' event
    if (socket.connected && !rejoinRef.current.inRoom) attemptRejoin();

    socket.on('presence:changed', (data: { count: number }) => setOnlineCount(data?.count ?? 0));
    socket.on('invite:received', (data: { inviteId: string; from: { id: string; name: string }; expiresAt: number }) => {
      setInviteError(null);
      setInviteNow(Date.now());
      setIncomingInvite({ inviteId: data.inviteId, fromName: data.from?.name || 'A player', expiresAt: data.expiresAt });
    });
    const dropInvite = (data: { inviteId: string }) =>
      setIncomingInvite(current => (current && current.inviteId === data.inviteId ? null : current));
    socket.on('invite:cancelled', dropInvite);
    socket.on('invite:expired', dropInvite);

    socket.on('playerDisconnected', (data: { playerId: string; playerName?: string; players: LobbyPlayer[] }) => {
      if (data.playerId === socket.id) return;
      setWaitingForName(data.playerName || 'Your friend');
    });

    socket.on('playerReconnected', (data: { playerId: string; playerName?: string; players: LobbyPlayer[] }) => {
      setLobbyPlayers(data.players);
      setWaitingForName(null);
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
      socket.off('visibilityChanged');
      socket.off('gamePaused');
      socket.off('chatMessage');
      socket.off('connect', attemptRejoin);
      socket.off('presence:changed');
      socket.off('invite:received');
      socket.off('invite:cancelled', dropInvite);
      socket.off('invite:expired', dropInvite);
      socket.off('playerDisconnected');
      socket.off('playerReconnected');
      socket.off('connect_error');
    };
  }, [gameMode, soundInitialized, difficulty]);

  // Leaving the Joda Memory page ends presence and lets any seat go into its grace period
  useEffect(() => () => disconnectSocket(), []);

  // Check for room ID in URL params and auto-join
  useEffect(() => {
    const urlRoomId = searchParams?.get('roomId');
    if (urlRoomId && !roomId && !gameMode) {
      setRoomId(urlRoomId);
      setGameMode('multiplayer');
      // Show the name step so the visitor actually joins the room before reaching the lobby
      setIsInLobby(false);
    }
  }, [searchParams, roomId, gameMode]);

  // Handle round completion and check for overall winner
  const handleRoundComplete = () => {
    // Determine round winner based on scores
    const score0 = players[0]?.score ?? 0;
    const score1 = players[1]?.score ?? 0;
    const winner = score0 > score1 ? 0 :
                   score1 > score0 ? 1 : null;

    if (winner !== null) {
      // Update round wins
      const newRoundWins = [...roundWins];
      newRoundWins[winner] = (newRoundWins[winner] ?? 0) + 1;
      setRoundWins(newRoundWins);
      setRoundWinner(winner);

      // Check if someone won the overall game (first to 4 rounds)
      if ((newRoundWins[winner] ?? 0) >= 4) {
        setOverallWinner(winner);
        setGameWon(true);
      } else {
        // More rounds to play
        setGameWon(true); // Temporarily show round won state
      }
    } else {
      // Equal pairs: nobody wins the round, play moves on
      setRoundTied(true);
      setGameWon(true);
    }
  };

  // Start next round
  const handleNextRound = () => {
    // In multiplayer the host deals the next round for both players over the socket
    if (gameMode === 'multiplayer') {
      if (isHost) handleMultiplayerStartGame();
      return;
    }
    setCurrentRound(prev => prev + 1);
    setRoundWinner(null);
    setGameWon(false);
    setSoloSave(null);

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
    if (!isMyTurn) return;

    const card = cards.find(c => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched || flippedCards.length >= 2) {
      return;
    }

    // Multiplayer flips are applied when the server echoes them back (see 'cardFlipped')
    if (gameMode === 'multiplayer') {
      socketRef.current?.emit('cardFlipped', { roomId, cardId });
      return;
    }

    applyFlip(cardId);
  };

  const applyFlip = (cardId: number) => {
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

  applyFlipRef.current = applyFlip;
  rejoinRef.current = { roomId, inRoom: gameMode === 'multiplayer' && (isInLobby || gameStarted) };

  // Solo times are personal bests on the player's profile; the server needs a session (guest or account) to save them
  const saveSoloRun = async (timeSeconds: number, finalMoves: number) => {
    setSoloSave({ status: 'saving' });
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/scores/solo`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty, timeSeconds, moves: finalMoves }),
      });
      if (res.status === 401) {
        setSoloSave({ status: 'signed-out' });
        return;
      }
      if (!res.ok) {
        setSoloSave({ status: 'error' });
        return;
      }
      const data: { personalBest: boolean; rank: number | null } = await res.json();
      setSoloSave({ status: 'saved', personalBest: data.personalBest, rank: data.rank });
    } catch {
      setSoloSave({ status: 'error' });
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

  // Leaving for real: give up the seat (mid-game that's a forfeit) and forget the room
  const handleBackToMenu = () => {
    clearCurrentRoom();
    // Leave room if in one
    if (socketRef.current && roomId) {
      socketRef.current.emit('leaveRoom', { roomId });
    }

    // Disconnect socket if connected
    // A fresh connection stops this room's events but keeps us listed as online
    if (socketRef.current) {
      disconnectSocket();
      socketRef.current = connectSocket();
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
    setRoundTied(false);
    setMyPlayerIndex(0);
    roundsDealtRef.current = 0;
    setPlayerLeftNotice(null);
    setWaitingForName(null);
    setSoloSave(null);
    setGamePaused(false);
    setPauseOwner(null);
  };

  const handleBackToMode = () => {
    if (gameMode === 'multiplayer' && roomId && (isInLobby || gameStarted)) {
      // Stepping out, not leaving: the server holds the seat and the header offers "Return to room"
      // (drop roomId from the address first: the header hides the reminder while the address points at the room)
      const url = new URL(window.location.href);
      url.searchParams.delete('roomId');
      window.history.replaceState({}, '', url.toString());
      setRoomId(null);
      saveCurrentRoom(roomId);
      disconnectSocket();
      socketRef.current = connectSocket();
    }
    setGameMode(null);
    setGameStarted(false);
    setIsInLobby(false);
  };

  const handleStartGame = (selectedDifficulty?: Difficulty) => {
    const diff = selectedDifficulty || difficulty;
    setDifficulty(diff);
    setGameStarted(true);
    setGameWon(false);
    setSoloSave(null);
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
        { id: '', name: 'You', score: 0, isHost: true, isReady: true, socketId: '' }
      ]);
    } else {
      // For multiplayer, reset existing player scores
      setPlayers(players.map(p => ({ ...p, score: 0 })));
    }
  };

  const handleRestart = () => {
    // A local reshuffle would split the two boards; the host re-deals for everyone instead
    if (gameMode === 'multiplayer') {
      if (isHost) handleMultiplayerStartGame();
      return;
    }
    handleStartGame(difficulty);
  };

  // Put this client back into its seat from a rejoin/join answer: lobby, or the running game rebuilt from the server's board
  const applyReclaimedSeat = (response: Extract<RejoinResponse, { success: true }>, socketId: string | undefined) => {
    const { room, game } = response;
    setConnectionError(null);
    setCodeError(null);
    setGameMode('multiplayer');
    setRoomId(room.id);
    setLobbyPlayers(room.players);
    setShowOpponentMoves(room.showOpponentMoves);
    const seat = room.players.findIndex(p => p.socketId === socketId);
    if (seat >= 0) {
      setMyPlayerIndex(seat);
      setIsHost(Boolean(room.players[seat]?.isHost));
      setIsReady(Boolean(room.players[seat]?.isReady));
    }
    if (!game) {
      setGameStarted(false);
      setIsInLobby(true);
      return;
    }
    const matched = new Set(game.matched);
    // A card can be face-up mid-turn; keep it so the next flip completes the same pair as on the server
    const flipped = new Set(game.flipped ?? []);
    setCards(game.cards.map((card, index) => {
      const imageData = IMAGE_POOL.find(img => img.name === card.iconName);
      return {
        id: index,
        iconName: card.iconName,
        Icon: imageData?.Icon || Gamepad2,
        imageUrl: imageData?.imageUrl,
        color: imageData?.color || 'from-slate-400 to-gray-600',
        isFlipped: flipped.has(index),
        isMatched: matched.has(index),
      };
    }));
    setDifficulty(game.cards.length >= 24 ? 'hard' : game.cards.length >= 16 ? 'medium' : 'easy');
    setFlippedCards(game.flipped ?? []);
    setCurrentPlayerIndex(game.currentPlayerIndex);
    setPlayers(room.players.map((p, i) => ({ ...p, score: game.pairs[i] ?? 0 })));
    setRoundWins(game.roundWins);
    setCurrentRound(game.currentRound);
    roundsDealtRef.current = game.currentRound;
    setGamePaused(Boolean(room.pausedById));
    setPauseOwner(room.pausedById ? { id: room.pausedById, name: room.pausedByName || 'Your friend' } : null);
    setGameWon(false);
    setIsInLobby(false);
    setGameStarted(true);
  };

  // In multiplayer the server decides (only whoever paused may resume) and its gamePaused broadcast updates both screens
  const requestPause = (paused: boolean) => {
    if (gameMode === 'multiplayer') {
      if (socketRef.current && roomId) socketRef.current.emit('togglePause', { roomId, paused });
      return;
    }
    setGamePaused(paused);
  };

  // A request was accepted: drop whatever we were doing (menu, solo game) and sit down in the new room's lobby
  const enterInviteRoom = (room: InviteRoom) => {
    setShowOnline(false);
    setIncomingInvite(null);
    setGameWon(false);
    setCards([]);
    setFlippedCards([]);
    setMoves(0);
    setTimer(0);
    applyReclaimedSeat({ success: true, room, game: null } as Extract<RejoinResponse, { success: true }>, socketRef.current?.id);
    const url = new URL(window.location.href);
    url.searchParams.set('roomId', room.id);
    window.history.pushState({}, '', url.toString());
    if (onlineName) saveDisplayName(onlineName);
    if (soundInitialized) getSoundManager().play('myTurn');
  };

  const answerInvite = (accept: boolean) => {
    const socket = socketRef.current;
    if (!socket || !incomingInvite) return;
    const { inviteId } = incomingInvite;
    socket.emit('invite:respond', { inviteId, accept, playerKey: getPlayerKey() }, (res: { success: boolean; room?: InviteRoom; error?: string }) => {
      if (!accept) {
        setIncomingInvite(null);
        return;
      }
      if (res?.success && res.room) {
        enterInviteRoom(res.room);
      } else {
        setIncomingInvite(null);
        setInviteError(res?.error === 'Request expired' ? 'That request expired before you answered.' : 'That player is no longer available.');
      }
    });
  };

  // The name typed for a room becomes the account's display name, which is what leaderboards show
  const saveDisplayName = async (name: string) => {
    if (!user || name === user.name) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await refreshSession();
    } catch {
      // The room still uses the typed name; saving it to the account can wait for the next game
    }
  };

  // Multiplayer functions
  const handleCreateGame = async () => {
    if (!playerName.trim() || !socketRef.current) return;

    try {
      const socket = socketRef.current;
      socket.emit('createGame', { playerName: playerName.trim(), difficulty, playerKey: getPlayerKey() }, (response: any) => {
        if (response.success) {
          setRoomId(response.roomId);
          setIsInLobby(true);
          setIsHost(true);
          setLobbyPlayers(response.room.players);
          setShowOpponentMoves(response.room.showOpponentMoves);
          saveDisplayName(playerName.trim());

          // Update URL with room ID
          const url = new URL(window.location.href);
          url.searchParams.set('roomId', response.roomId);
          window.history.pushState({}, '', url.toString());

          if (soundInitialized) {
            getSoundManager().play('myTurn');
          }
        }
      });
    } catch (error) {
      console.error('Failed to create game:', error);
      setConnectionError('Failed to create game');
    }
  };

  // `code` is set when joining with a typed room code instead of an invite link
  const handleJoinGame = async (code?: string) => {
    const targetRoom = code ?? roomId;
    if (!playerName.trim() || !targetRoom || !socketRef.current) return;

    try {
      const socket = socketRef.current;
      socket.emit('joinGame', { roomId: targetRoom, playerName: playerName.trim(), playerKey: getPlayerKey() }, (response: any) => {
        if (response.success && response.rejoined) {
          applyReclaimedSeat(response, socket.id);
          const url = new URL(window.location.href);
          url.searchParams.set('roomId', response.room.id);
          window.history.replaceState({}, '', url.toString());
          return;
        }
        if (response.success) {
          if (code) {
            setRoomId(response.room?.id ?? code);
            const url = new URL(window.location.href);
            url.searchParams.set('roomId', response.room?.id ?? code);
            window.history.pushState({}, '', url.toString());
          }
          setCodeError(null);
          setIsInLobby(true);
          setIsHost(false);
          setLobbyPlayers(response.room.players);
          setShowOpponentMoves(response.room.showOpponentMoves);
          saveDisplayName(playerName.trim());

          if (soundInitialized) {
            getSoundManager().play('match');
          }
        } else if (code) {
          setCodeError(
            /not found/i.test(response.error ?? '')
              ? `There's no open room with the code ${code}. Check the code, or ask your friend for the link.`
              : response.error || "Couldn't join that room."
          );
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

    // The server shuffles and deals; the host only picks the size of the deck
    socketRef.current.emit('startGame', { roomId, difficulty });
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

  // Presentational only: the turn chip copy shown on the scoreboard and announced to screen readers
  const turnLabel = (index: number) =>
    index === (gameMode === 'multiplayer' ? myPlayerIndex : 0)
      ? 'Your turn'
      : gameMode === 'single' ? "AI's turn" : 'Their turn';

  return (
    <div className="min-h-screen">
      {gameStarted ? (
        /* Slim game bar: one row on desktop, two compact rows on phones */
        <header className="sticky top-0 z-40 border-b border-white/10 bg-felt-deep">
          <div className="page flex flex-wrap items-center gap-x-3 gap-y-1 py-2 sm:gap-x-5">
            <Link
              href="/games"
              className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-chalk transition hover:bg-white/5 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Games
            </Link>
            <h1 className="title-md truncate">Joda Memory</h1>

            <dl className="order-last flex w-full items-center gap-5 pb-1 text-sm md:order-none md:ml-auto md:w-auto md:pb-0">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-chalk">Time</dt>
                <dd className="font-display text-lg font-bold tabular-nums">{formatTime(timer)}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-chalk">Moves</dt>
                <dd className="font-display text-lg font-bold tabular-nums">{moves}</dd>
              </div>
              {gameMode === 'multiplayer' ? (
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-chalk">Round</dt>
                  <dd className="font-display text-lg font-bold tabular-nums">{currentRound}</dd>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-chalk">Best</dt>
                  <dd className="font-display text-lg font-bold tabular-nums">
                    {bestTime ? formatTime(bestTime) : '--:--'}
                  </dd>
                </div>
              )}
            </dl>

            <div className="ml-auto md:ml-0">
              <SoundControls />
            </div>
          </div>
        </header>
      ) : (
        <SiteHeader />
      )}

      <main className={`page ${gameStarted ? 'py-4 md:py-6' : 'py-8 md:py-12'}`}>
        {/* Title row for the menu and lobby screens; in a game the title lives in the game bar */}
        {!gameStarted && (
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="title-lg">Joda Memory</h1>
              <p className="mt-2 text-chalk">Flip two cards at a time and find every matching pair.</p>
            </div>
            <SoundControls />
          </div>
        )}

        {/* Scoreboard */}
        {gameStarted && (
          <section aria-label="Scoreboard" className="mx-auto mb-4 max-w-3xl md:mb-6">
            <p className="sr-only" aria-live="polite">
              {currentPlayer && !gameWon ? turnLabel(currentPlayerIndex) : ''}
            </p>
            <div className={`grid gap-2 sm:gap-3 ${players.length > 1 ? 'grid-cols-2' : 'grid-cols-1 sm:max-w-xs'}`}>
              {players.map((player, index) => {
                const isTurn = index === currentPlayerIndex && gameStarted && !gameWon;
                return (
                  <div
                    key={index}
                    className={`panel flex items-center justify-between gap-3 p-3 transition sm:p-4 ${
                      isTurn ? 'ring-2 ring-gold' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{player.name}</p>
                      {isTurn ? (
                        <span
                          className={`mt-1 inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            turnLabel(index) === 'Your turn' ? 'bg-signal text-ink' : 'bg-white/10 text-chalk ring-1 ring-inset ring-white/15'
                          }`}
                        >
                          {turnLabel(index)}
                        </span>
                      ) : player.isGuest ? (
                        <span className="mt-1 block text-xs text-chalk">Guest</span>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-2xl font-extrabold leading-none tabular-nums sm:text-3xl">
                        {player.score}
                        <span className="sr-only"> pairs</span>
                      </p>
                      <p className="mt-1 text-xs text-chalk" aria-hidden="true">pairs</p>
                      {gameMode === 'multiplayer' && (
                        <p className="text-xs text-chalk">Rounds won: {roundWins[index]}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {gameMode === 'multiplayer' && (
              <>
                <p className="mt-2 text-sm text-chalk">First to win 4 rounds wins the game.</p>
                {waitingForName && (
                  <div className="mt-3">
                    <ReconnectingNotice name={waitingForName} />
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Incoming game request: pops up anywhere on this page while we're not in a room */}
        {incomingInvite && !inRoomNow && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-felt-deep/80 p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="invite-title" className="panel w-full max-w-sm p-6 shadow-lift">
              <Swords className="h-8 w-8 text-gold" aria-hidden="true" />
              <h2 id="invite-title" className="title-lg mt-3">
                {incomingInvite.fromName} wants to play
              </h2>
              <p className="mt-2 text-chalk">
                Joda Memory, you against {incomingInvite.fromName}.{' '}
                {gameStarted && gameMode === 'single' ? 'Accepting ends your solo game. ' : ''}
                This request expires in {Math.max(0, Math.ceil((incomingInvite.expiresAt - inviteNow) / 1000))}s.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button type="button" onClick={() => answerInvite(true)} className="btn-gold" autoFocus>
                  Accept
                </button>
                <button type="button" onClick={() => answerInvite(false)} className="btn-quiet">
                  Decline
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result dialog: round won, game won or solo board cleared */}
        {gameWon && winner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-felt-deep/80 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="memory-result-title"
              className="panel w-full max-w-sm p-6 shadow-lift"
            >
              {gameMode === 'multiplayer' && overallWinner !== null ? (
                // Overall game winner
                <>
                  <Trophy className="h-8 w-8 text-gold" aria-hidden="true" />
                  <h2 id="memory-result-title" className="title-lg mt-3">
                    {players[overallWinner]?.name} wins the game
                  </h2>
                  <dl className="mt-4 space-y-1 text-chalk">
                    <div className="flex justify-between gap-4">
                      <dt>Rounds won</dt>
                      <dd className="font-semibold tabular-nums text-white">
                        {roundWins[overallWinner]} to {roundWins[overallWinner === 0 ? 1 : 0]}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Rounds played</dt>
                      <dd className="font-semibold tabular-nums text-white">{currentRound}</dd>
                    </div>
                  </dl>
                  <div className="mt-6 flex flex-col gap-2">
                    <button type="button" onClick={handleBackToMenu} className="btn-quiet" autoFocus>
                      Back to menu
                    </button>
                  </div>
                </>
              ) : gameMode === 'multiplayer' && roundWinner !== null ? (
                // Round winner
                <>
                  <h2 id="memory-result-title" className="title-lg">
                    {players[roundWinner]?.name} won round {currentRound}
                  </h2>
                  <dl className="mt-4 space-y-1 text-chalk">
                    <div className="flex justify-between gap-4">
                      <dt>Pairs this round</dt>
                      <dd className="font-semibold tabular-nums text-white">
                        {roundWinner !== null && players[roundWinner] ? `${players[roundWinner].score} to ${players[roundWinner === 0 ? 1 : 0]?.score ?? 0}` : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Rounds won</dt>
                      <dd className="font-semibold tabular-nums text-white">
                        {roundWins[0]} to {roundWins[1]}
                      </dd>
                    </div>
                  </dl>
                  <NextRoundActions isHost={isHost} onNextRound={handleNextRound} onLeave={handleBackToMenu} />
                </>
              ) : gameMode === 'multiplayer' && roundTied ? (
                // Tied round: no round win, play continues
                <>
                  <h2 id="memory-result-title" className="title-lg">
                    Round {currentRound} is a tie
                  </h2>
                  <p className="mt-2 text-chalk">You found the same number of pairs, so nobody wins this round.</p>
                  <dl className="mt-4 space-y-1 text-chalk">
                    <div className="flex justify-between gap-4">
                      <dt>Rounds won</dt>
                      <dd className="font-semibold tabular-nums text-white">
                        {roundWins[0]} to {roundWins[1]}
                      </dd>
                    </div>
                  </dl>
                  <NextRoundActions isHost={isHost} onNextRound={handleNextRound} onLeave={handleBackToMenu} />
                </>
              ) : (
                // Single player victory
                <>
                  <h2 id="memory-result-title" className="title-lg">You found every pair</h2>
                  {timer === bestTime && (
                    <p className="chip mt-3 text-white">
                      <Trophy className="h-4 w-4 text-gold" aria-hidden="true" />
                      New best time
                    </p>
                  )}
                  <dl className="mt-4 space-y-1 text-chalk">
                    <div className="flex justify-between gap-4">
                      <dt>Pairs</dt>
                      <dd className="font-semibold tabular-nums text-white">{winner.score}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Time</dt>
                      <dd className="font-semibold tabular-nums text-white">{formatTime(timer)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Moves</dt>
                      <dd className="font-semibold tabular-nums text-white">{moves}</dd>
                    </div>
                  </dl>
                  <SoloSaveStatus save={soloSave} difficulty={difficulty} />
                  <div className="mt-6 flex flex-col gap-2">
                    <button type="button" onClick={handleNextRound} className="btn-gold" autoFocus>
                      Play again
                    </button>
                    <button type="button" onClick={handleBackToMenu} className="btn-quiet">
                      Back to menu
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Game Board */}
        {!gameMode && showOnline ? (
          <OnlinePlayers
            socket={socketRef.current}
            name={playerName}
            onNameChange={setPlayerName}
            playerKey={getPlayerKey()}
            difficulty={difficulty}
            onBack={() => setShowOnline(false)}
            onRoomReady={enterInviteRoom}
          />
        ) : !gameMode ? (
          <section aria-labelledby="memory-mode-title" className="max-w-2xl">
            <h2 id="memory-mode-title" className="title-md mb-4">How do you want to play?</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleModeSelect('single')}
                className="flex flex-col items-start gap-3 rounded-card bg-card p-5 text-left text-ink shadow-rest ring-1 ring-black/5 transition hover:shadow-lift"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-felt text-gold">
                  <User className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="title-md">Play solo</span>
                <span className="text-sm text-ink-soft">Find every pair as fast as you can and beat your best time.</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeSelect('multiplayer')}
                className="flex flex-col items-start gap-3 rounded-card bg-card p-5 text-left text-ink shadow-rest ring-1 ring-black/5 transition hover:shadow-lift"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-felt text-gold">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="title-md">Play with a friend</span>
                <span className="text-sm text-ink-soft">Open a room, send the link and take turns finding pairs.</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOnline(true)}
                className="flex flex-col items-start gap-3 rounded-card bg-card p-5 text-left text-ink shadow-rest ring-1 ring-black/5 transition hover:shadow-lift sm:col-span-2"
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-felt text-gold">
                    <Globe className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold text-ink-soft">
                    {Math.max(0, onlineCount - 1)} online
                  </span>
                </span>
                <span className="title-md">Find players online</span>
                <span className="text-sm text-ink-soft">See who else has Joda Memory open and send them a game request.</span>
              </button>
            </div>
            {inviteError && (
              <p role="alert" className="mt-4 text-sm text-white">
                {inviteError}
              </p>
            )}
          </section>
        ) : !gameStarted ? (
          gameMode === 'multiplayer' && !isInLobby ? (
            /* Multiplayer Name Input */
            <section aria-labelledby="memory-name-title" className="max-w-md">
              <h2 id="memory-name-title" className="title-md mb-4">
                {roomId ? "Join your friend's game" : 'Create a room'}
              </h2>

              {connectionError && (
                <div role="alert" className="panel mb-4 p-5 ring-signal/60">
                  <div className="flex items-center gap-2">
                    <X className="h-5 w-5 text-signal" aria-hidden="true" />
                    <h3 className="font-display text-lg font-bold">
                      {/full/i.test(connectionError) ? 'This room is full' : "Couldn't join the room"}
                    </h3>
                  </div>
                  <p className="mt-1 text-chalk">
                    {/full/i.test(connectionError)
                      ? 'Two players are already in this room. Ask your friend to create a new room and send you the new link.'
                      : /not found/i.test(connectionError)
                      ? roomId
                        ? 'This room has closed. Ask your friend to create a new room and send you the new link.'
                        : 'Your room closed while you were away. Create a new room and send the new link.'
                      : connectionError}
                  </p>
                  <button
                    onClick={() => {
                      setConnectionError(null);
                      setRoomId(null);
                      setGameMode(null);
                    }}
                    className="btn-quiet btn-sm mt-4"
                  >
                    Back to menu
                  </button>
                </div>
              )}

              <div className="panel p-5 sm:p-6">
                <label htmlFor="memory-player-name" className="field-label">
                  Your name
                </label>
                <input
                  id="memory-player-name"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="The name your friend will see"
                  maxLength={20}
                  autoComplete="nickname"
                  className="field"
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

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  {!roomId && (
                    <button
                      onClick={handleCreateGame}
                      disabled={!playerName.trim()}
                      className="btn-gold sm:flex-1"
                    >
                      Create room
                    </button>
                  )}
                  {roomId && (
                    <button
                      onClick={() => handleJoinGame()}
                      disabled={!playerName.trim()}
                      className="btn-gold sm:flex-1"
                    >
                      Join game
                    </button>
                  )}
                  <button
                    onClick={handleBackToMode}
                    className="btn-quiet"
                  >
                    Back
                  </button>
                </div>

                {!roomId && (
                  <form
                    className="mt-6 border-t border-white/10 pt-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (playerName.trim() && codeInput.length === 6) handleJoinGame(codeInput);
                    }}
                  >
                    <label htmlFor="memory-room-code" className="field-label">
                      Have a code from a friend?
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="memory-room-code"
                        type="text"
                        inputMode="text"
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        value={codeInput}
                        onChange={(e) => {
                          setCodeError(null);
                          setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                        }}
                        placeholder="6-character code"
                        aria-describedby={codeError ? 'memory-room-code-error' : undefined}
                        className="field min-w-0 flex-1 font-display tracking-[0.2em]"
                      />
                      <button
                        type="submit"
                        disabled={!playerName.trim() || codeInput.length !== 6}
                        className="btn-quiet shrink-0"
                      >
                        Join
                      </button>
                    </div>
                    {codeError ? (
                      <p id="memory-room-code-error" role="alert" className="mt-2 text-sm text-white">
                        {codeError}
                      </p>
                    ) : (
                      !playerName.trim() && codeInput.length === 6 && (
                        <p className="mt-2 text-sm text-chalk">Add your name above to join.</p>
                      )
                    )}
                  </form>
                )}
              </div>
            </section>
          ) : gameMode === 'multiplayer' && isInLobby ? (
            /* Multiplayer Lobby */
            <section aria-labelledby="memory-lobby-title" className="max-w-2xl space-y-4">
              <h2 id="memory-lobby-title" className="title-md">Game room</h2>

              {waitingForName && <ReconnectingNotice name={waitingForName} />}

              {playerLeftNotice && (
                <div role="status" className="flex items-start justify-between gap-3 rounded-2xl bg-felt-deep p-4 ring-1 ring-inset ring-signal/60">
                  <div>
                    <p className="font-semibold">
                      {playerLeftNotice.name} left {playerLeftNotice.duringGame ? 'the game' : 'the room'}
                    </p>
                    <p className="mt-1 text-sm text-chalk">
                      {playerLeftNotice.forfeit
                        ? playerLeftNotice.reachedRound >= 4
                        ? 'You win by forfeit, and it counts on the leaderboard. Send the link again to play with someone new.'
                        : "You win by forfeit. It's in your match history, but games only count on the leaderboard once they reach round 4."
                        : playerLeftNotice.duringGame
                        ? 'The game ended before anyone flipped a card, so nothing was saved. Send the link again to play with someone new.'
                        : 'Send the link again to play with someone new.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlayerLeftNotice(null)}
                    className="btn-quiet btn-sm min-h-11 shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              {/* Room Code */}
              <div className="panel p-5">
                <p className="text-sm text-chalk">Room code</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <span className="break-all font-display text-2xl font-extrabold sm:text-3xl">{roomId}</span>
                  <button
                    type="button"
                    onClick={handleCopyRoomLink}
                    className="btn-quiet btn-sm min-h-11"
                  >
                    {copiedLink ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copiedLink ? 'Copied' : 'Copy link'}
                  </button>
                </div>
                <p className="mt-3 text-sm text-chalk" aria-live="polite">
                  {copiedLink ? 'Copied. Send the link to your friend so they can join.' : 'Send the room link to a friend so they can join.'}
                </p>
              </div>

              {/* Players List */}
              <div className="panel p-5">
                <h3 className="font-display text-lg font-bold">Players ({lobbyPlayers.length} of 2)</h3>
                <ul className="mt-3 space-y-2">
                  {lobbyPlayers.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-felt-deep/60 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">{player.name}</span>
                        {player.isHost && <span className="chip px-2 py-0.5 text-xs">Host</span>}
                      </div>
                      {player.isReady ? (
                        <span className="chip shrink-0 text-white ring-gold/50">
                          <Check className="h-4 w-4 text-gold" aria-hidden="true" />
                          Ready
                        </span>
                      ) : (
                        <span className="chip shrink-0">Not ready</span>
                      )}
                    </li>
                  ))}
                  {lobbyPlayers.length < 2 && (
                    <li className="rounded-xl border border-dashed border-white/20 px-4 py-3 text-chalk">
                      Waiting for your friend to join…
                    </li>
                  )}
                </ul>
              </div>

              {/* Game Settings - Visibility Toggle */}
              <div className="panel flex items-center justify-between gap-4 p-5">
                <div className="flex items-start gap-3">
                  {showOpponentMoves ? (
                    <Eye className="mt-0.5 h-5 w-5 shrink-0 text-chalk" aria-hidden="true" />
                  ) : (
                    <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-chalk" aria-hidden="true" />
                  )}
                  <div>
                    <p id="memory-visibility-label" className="font-semibold">Show cards on their turn</p>
                    <p className="text-sm text-chalk">
                      {showOpponentMoves ? 'You can see the cards your friend flips.' : 'Cards are hidden while your friend plays.'}
                    </p>
                  </div>
                </div>
                {isHost ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showOpponentMoves}
                    aria-labelledby="memory-visibility-label"
                    onClick={() => {
                      const newValue = !showOpponentMoves;
                      setShowOpponentMoves(newValue);
                      if (socketRef.current && roomId) {
                        socketRef.current.emit('toggleOpponentMoves', { roomId, showOpponentMoves: newValue });
                      }
                    }}
                    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition ${
                      showOpponentMoves ? 'bg-gold' : 'bg-felt-deep ring-1 ring-inset ring-table-rim'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-6 w-6 rounded-full shadow transition-transform ${
                        showOpponentMoves ? 'translate-x-6 bg-ink' : 'translate-x-0 bg-chalk'
                      }`}
                    />
                  </button>
                ) : (
                  <span className="chip shrink-0">
                    {showOpponentMoves ? 'On' : 'Off'}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <p className="text-chalk" aria-live="polite">
                {lobbyPlayers.length < 2
                  ? 'Waiting for your friend to join…'
                  : !lobbyPlayers.every(p => p.isReady)
                    ? 'The game can start when both players are ready.'
                    : isHost
                      ? 'Everyone is ready. Start the game when you are.'
                      : 'Everyone is ready. Waiting for the host to start the game.'}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {isHost && (
                  <button
                    onClick={handleMultiplayerStartGame}
                    disabled={!lobbyPlayers.every(p => p.isReady) || lobbyPlayers.length < 2}
                    className="btn-gold"
                  >
                    Start game
                  </button>
                )}

                <button
                  onClick={handleToggleReady}
                  disabled={lobbyPlayers.length < 2}
                  aria-pressed={isReady}
                  className="btn-quiet"
                >
                  {isReady ? <Check className="h-4 w-4 text-gold" aria-hidden="true" /> : null}
                  {isReady ? "I'm ready" : 'Mark me ready'}
                </button>

                <button
                  onClick={handleBackToMenu}
                  className="btn-quiet sm:ml-auto"
                >
                  Leave room
                </button>
              </div>
            </section>
          ) : (
            /* Single Player Difficulty Selection */
            <section aria-labelledby="memory-difficulty-title" className="max-w-md">
              <h2 id="memory-difficulty-title" className="title-md mb-4">Choose a difficulty</h2>
              <div
                role="group"
                aria-labelledby="memory-difficulty-title"
                className="grid grid-cols-3 gap-1 rounded-2xl bg-felt-deep p-1 ring-1 ring-inset ring-table-rim"
              >
                {([
                  ['easy', 'Easy', '8 cards'],
                  ['medium', 'Medium', '16 cards'],
                  ['hard', 'Hard', '24 cards'],
                ] as const).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={difficulty === value}
                    onClick={() => setDifficulty(value)}
                    className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-2 py-2 transition ${
                      difficulty === value ? 'bg-card text-ink shadow-rest' : 'text-chalk hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className={`text-xs ${difficulty === value ? 'text-ink-soft' : 'text-chalk/80'}`}>{count}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm text-chalk">
                {bestTime ? `Your best time on this level: ${formatTime(bestTime)}` : 'No best time on this level yet.'}
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleStartGame(difficulty)}
                  className="btn-gold sm:flex-1"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Start game
                </button>
                <button
                  onClick={handleBackToMode}
                  className="btn-quiet"
                >
                  Back
                </button>
              </div>
            </section>
          )
        ) : (
          <>
            <div
              className={`relative mx-auto grid gap-2 md:gap-3 ${
                difficulty === 'hard' ? 'grid-cols-4 md:max-w-3xl md:grid-cols-6' : 'max-w-lg grid-cols-4'
              }`}
            >
              {/* Overlay when it's not your turn AND visibility is disabled */}
              {!isMyTurn && !showOpponentMoves && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-felt-deep/80 p-4">
                  <div className="panel max-w-xs p-6 text-center shadow-lift">
                    {gameMode === 'single' ? (
                      <>
                        <Bot className="mx-auto h-10 w-10 text-chalk" strokeWidth={1.5} aria-hidden="true" />
                        <h3 className="title-md mt-3">The computer is playing</h3>
                        <p className="mt-1 text-chalk">Your turn is next.</p>
                      </>
                    ) : (
                      <>
                        <Clock className="mx-auto h-10 w-10 text-chalk" strokeWidth={1.5} aria-hidden="true" />
                        <h3 className="title-md mt-3">Their turn</h3>
                        <p className="mt-1 text-chalk">Cards are hidden while your friend plays.</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Pause Overlay */}
              {gamePaused && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-felt-deep/90 p-4">
                  <div className="panel max-w-xs p-6 text-center shadow-lift">
                    <Pause className="mx-auto h-10 w-10 text-chalk" strokeWidth={1.5} aria-hidden="true" />
                    {canResume ? (
                      <>
                        <h3 className="title-md mt-3">Game paused</h3>
                        <p className="mt-1 text-chalk">The timer is stopped. Resume when you&apos;re ready.</p>
                        <button onClick={() => requestPause(false)} className="btn-gold mt-5 w-full" autoFocus>
                          <Play className="h-4 w-4" aria-hidden="true" />
                          Resume game
                        </button>
                      </>
                    ) : (
                      <>
                        <h3 className="title-md mt-3">{pauseOwner?.name ?? 'Your friend'} paused the game</h3>
                        <p className="mt-1 text-chalk">
                          The timer is stopped. Only {pauseOwner?.name ?? 'they'} can resume it.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {cards.map((card, index) => {
                // With "show cards on their turn" off, the other player's flips stay face-down on this screen,
                // including a pair they match (it fades out without being turned over)
                const canSeeFlips = gameMode !== 'multiplayer' || isMyTurn || showOpponentMoves;
                const faceUp = (card.isFlipped || card.isMatched) && canSeeFlips;
                return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleCardClick(card.id)}
                  disabled={card.isMatched || card.isFlipped || !isMyTurn}
                  aria-label={`Card ${index + 1}, ${
                    card.isMatched
                      ? 'matched'
                      : faceUp
                        ? `face up, ${card.iconName.replace('img', 'picture ')}`
                        : 'face down'
                  }`}
                  className={`flip-scene aspect-[3/4] w-full rounded-card transition-[opacity,transform,visibility] duration-300 ${
                    // Matched pairs leave the table but keep their slot so the grid doesn't shift
                    card.isMatched ? 'invisible scale-75 opacity-0' : ''
                  } ${
                    isMyTurn && !card.isMatched && !card.isFlipped
                      ? 'cursor-pointer'
                      : showOpponentMoves && !isMyTurn
                      ? 'cursor-default'
                      : 'cursor-not-allowed'
                  }`}
                >
                  {/* Face-down cards are .is-flipped: the flip utilities show the patterned back when flipped */}
                  <span className={`flip-inner block ${faceUp ? '' : 'is-flipped'}`}>
                    {/* Card Front */}
                    <span
                      className={`flip-face overflow-hidden rounded-card bg-card shadow-rest ${
                        card.isMatched ? 'ring-[3px] ring-gold' : 'ring-1 ring-black/5'
                      }`}
                    >
                      {card.imageUrl ? (
                        <span className={`relative block h-full w-full ${card.isMatched ? 'opacity-60' : ''}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={card.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              // Fallback to icon on image load error
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          {/* Fallback Icon Container (hidden by default) */}
                          <span className="absolute inset-0 hidden items-center justify-center bg-card">
                            <span className={`rounded-xl bg-gradient-to-br p-2.5 sm:p-3 ${card.color}`}>
                              <card.Icon
                                className={`${
                                  difficulty === 'hard'
                                    ? 'h-7 w-7 md:h-8 md:w-8'
                                    : difficulty === 'medium'
                                    ? 'h-8 w-8 md:h-10 md:w-10'
                                    : 'h-10 w-10 md:h-12 md:w-12'
                                } text-white`}
                                strokeWidth={2}
                                aria-hidden="true"
                              />
                            </span>
                          </span>
                        </span>
                      ) : (
                        // Fallback to icon if no image URL
                        <span className={`flex h-full w-full items-center justify-center bg-card ${card.isMatched ? 'opacity-60' : ''}`}>
                          <span className={`rounded-xl bg-gradient-to-br p-2.5 sm:p-3 ${card.color}`}>
                            <card.Icon
                              className={`${
                                difficulty === 'hard'
                                  ? 'h-7 w-7 md:h-8 md:w-8'
                                  : difficulty === 'medium'
                                  ? 'h-8 w-8 md:h-10 md:w-10'
                                  : 'h-10 w-10 md:h-12 md:w-12'
                              } text-white`}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                          </span>
                        </span>
                      )}
                    </span>

                    {/* Card Back */}
                    <span className="flip-face flip-face-back card-back rounded-card" aria-hidden="true" />
                  </span>
                </button>
                );
              })}
            </div>

            {/* Game Controls */}
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center gap-2">
              {gameStarted && !gameWon && (
                <button
                  onClick={() => requestPause(!gamePaused)}
                  disabled={gamePaused && !canResume}
                  className="btn-quiet btn-sm min-h-11"
                >
                  {gamePaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                  {gamePaused ? (canResume ? 'Resume' : `Paused by ${pauseOwner?.name ?? 'your friend'}`) : 'Pause'}
                </button>
              )}
              {/* In multiplayer new cards only come from "Next round"; the server rejects mid-round deals */}
              {gameMode !== 'multiplayer' && (
                <button
                  onClick={handleRestart}
                  className="btn-quiet btn-sm min-h-11"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restart
                </button>
              )}
              {gameStarted && !gameWon && (
                <>
                  <button
                    onClick={handleBackToMode}
                    className="btn-quiet btn-sm min-h-11 sm:ml-auto"
                  >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    Menu
                  </button>
                  <button
                    onClick={handleBackToMenu}
                    className="btn-quiet btn-sm min-h-11"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Quit game
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Instructions */}
        {!gameStarted && (
          <section aria-labelledby="memory-how-title" className="panel mt-10 max-w-2xl p-5 sm:p-6">
            <h2 id="memory-how-title" className="title-md">How to play</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-chalk marker:text-gold">
              <li>Flip two cards per turn. If the pictures match, you keep the pair.</li>
              <li>If they don&apos;t match, both cards turn face down again. Remember where they were.</li>
              <li>Playing solo: clear the board in as little time and as few moves as you can.</li>
              <li>With a friend: take turns. Most pairs wins the round, and the first to win 4 rounds wins the game.</li>
            </ul>
          </section>
        )}
      </main>

      {/* Invite Player Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-felt-deep/80 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="memory-invite-title"
            className="panel relative w-full max-w-md p-6 shadow-lift"
          >
            {/* Close button */}
            <button
              onClick={() => setShowInviteModal(false)}
              aria-label="Close"
              className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-lg text-chalk transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="mb-5 pr-10">
              <h2 id="memory-invite-title" className="title-md">Invite a friend</h2>
              <p className="mt-1 text-chalk">Send this link to a friend so they can join your game.</p>
            </div>

            <div className="mb-4">
              <label htmlFor="memory-invite-link" className="field-label">Game link</label>
              <div className="flex items-center gap-2">
                <input
                  id="memory-invite-link"
                  type="text"
                  readOnly
                  value={typeof window !== 'undefined' ? `${window.location.href}?gameId=placeholder123` : 'Loading...'}
                  className="field min-w-0 flex-1 text-sm"
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
                  className="btn-quiet shrink-0"
                >
                  Copy link
                </button>
              </div>
            </div>

            <p className="mb-6 text-sm text-chalk">
              When your friend opens the link, they join your game and you can start playing together.
            </p>

            <button
              onClick={() => setShowInviteModal(false)}
              className="btn-quiet w-full"
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
            <div className="panel flex h-96 w-[calc(100vw-2rem)] max-w-xs flex-col shadow-lift">
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-white/10 py-1 pl-4 pr-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-chalk" aria-hidden="true" />
                  <h3 className="font-semibold">Chat</h3>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  aria-label="Close chat"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-chalk transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {/* Messages List */}
              <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
                {chatMessages.length === 0 ? (
                  <p className="text-sm text-chalk">No messages yet. Say hi.</p>
                ) : (
                  chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.playerId === socketRef.current?.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] rounded-xl px-3 py-2 ${
                        msg.playerId === socketRef.current?.id
                          ? 'bg-table-rim text-white'
                          : 'bg-felt-deep text-white'
                      }`}>
                        <p className="mb-0.5 text-xs font-semibold text-chalk">{msg.playerName}</p>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Message Input */}
              <div className="border-t border-white/10 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message"
                    aria-label="Message"
                    className="field min-w-0 flex-1 px-3 py-2"
                    maxLength={200}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim()}
                    aria-label="Send message"
                    className="btn-quiet btn-sm min-h-11 shrink-0"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Minimized Chat Button */
            <button
              onClick={() => setShowChat(true)}
              aria-label={chatMessages.length > 0 ? `Open chat, ${chatMessages.length} messages` : 'Open chat'}
              className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-table text-white shadow-lift ring-1 ring-inset ring-table-rim transition hover:bg-table-rim"
            >
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
              {chatMessages.length > 0 && (
                <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-xs font-bold text-ink">
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

// Only the host can deal the next round; the other player waits for the deal to arrive
function NextRoundActions({ isHost, onNextRound, onLeave }: { isHost: boolean; onNextRound: () => void; onLeave: () => void }) {
  return (
    <div className="mt-6 flex flex-col gap-2">
      {isHost ? (
        <button type="button" onClick={onNextRound} className="btn-gold" autoFocus>
          Next round
        </button>
      ) : (
        <p className="text-center text-sm text-chalk" aria-live="polite">
          Waiting for the host to deal the next round…
        </p>
      )}
      <button type="button" onClick={onLeave} className="btn-quiet" autoFocus={!isHost}>
        Leave game
      </button>
    </div>
  );
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'easy', medium: 'medium', hard: 'hard' };

// Tells the solo player whether their time reached the leaderboard
function SoloSaveStatus({
  save,
  difficulty,
}: {
  save:
    | { status: 'saving' | 'signed-out' | 'error' }
    | { status: 'saved'; personalBest: boolean; rank: number | null }
    | null;
  difficulty: Difficulty;
}) {
  if (!save) return null;
  return (
    <div className="mt-4 rounded-xl bg-felt-deep/60 p-3 text-sm" aria-live="polite">
      {save.status === 'saving' && <p className="text-chalk">Saving your time…</p>}
      {save.status === 'saved' && (
        <p className="text-chalk">
          {save.personalBest
            ? `New personal best on ${DIFFICULTY_LABEL[difficulty]}, saved to your profile.`
            : 'Saved to your profile. Your best time on this level is still faster.'}{' '}
          <Link href="/profile" className="font-semibold text-gold underline-offset-2 hover:underline">
            See your profile
          </Link>
        </p>
      )}
      {save.status === 'saved' && <LeaderboardNameForm />}
      {save.status === 'signed-out' && (
        <p className="text-chalk">
          Your time wasn&apos;t saved because you aren&apos;t signed in.{' '}
          <Link href="/login" className="font-semibold text-gold underline-offset-2 hover:underline">
            Sign in or play as a guest
          </Link>{' '}
          to keep your best times on your profile.
        </p>
      )}
      {save.status === 'error' && (
        <p className="text-chalk">Couldn&apos;t save your time. Check your connection; your next game will try again.</p>
      )}
    </div>
  );
}

type RejoinResponse =
  | { success: false; error?: string }
  | {
      success: true;
      room: {
        id: string;
        players: LobbyPlayer[];
        difficulty: Difficulty;
        showOpponentMoves: boolean;
        gameStarted: boolean;
        pausedById?: string | null;
        pausedByName?: string | null;
      };
      game: null | {
        cards: { iconName: string }[];
        matched: number[];
        flipped?: number[];
        currentPlayerIndex: number;
        pairs: number[];
        roundWins: number[];
        currentRound: number;
      };
    };

// A random id per browser tab so the server can hand our seat back after the connection drops
function getPlayerKey(): string {
  try {
    let key = sessionStorage.getItem('joda-player-key');
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem('joda-player-key', key);
    }
    return key;
  } catch {
    return (window as unknown as { __jodaPlayerKey?: string }).__jodaPlayerKey ??= crypto.randomUUID();
  }
}

function ReconnectingNotice({ name }: { name: string }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl bg-felt-deep p-4 ring-1 ring-inset ring-gold/40">
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-gold" aria-hidden="true" />
      <p className="text-sm text-chalk">
        <span className="font-semibold text-white">{name}</span> lost their connection. Waiting for them to come back…
      </p>
    </div>
  );
}

// Guests are created as "Guest 1a2b3c4d"; those names shouldn't be prefilled or shown as a choice
function isDefaultGuestName(name: string | null | undefined): boolean {
  return !name || /^Guest [0-9a-f]{8}$/i.test(name);
}

// Lets a guest with an auto-generated name choose the name other players see, right after a win
function LeaderboardNameForm() {
  const { user, refreshSession } = useAuth();
  const [name, setName] = useState('');
  const [state, setState] = useState<{ status: 'idle' | 'saving' | 'saved' } | { status: 'error'; message: string }>({ status: 'idle' });
  if (!user || (!isDefaultGuestName(user.name) && state.status !== 'saved')) return null;
  if (state.status === 'saved') {
    return <p className="mt-2 text-chalk" aria-live="polite">Saved. Other players now see you as {user.name}.</p>;
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: 'saving' });
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: 'error', message: body.error ?? "Couldn't save your name. Try again." });
        return;
      }
      await refreshSession();
      setState({ status: 'saved' });
    } catch {
      setState({ status: 'error', message: "Couldn't save your name. Check your connection and try again." });
    }
  };

  return (
    <form onSubmit={save} className="mt-3 border-t border-white/10 pt-3">
      <label htmlFor="leaderboard-name" className="field-label">
        Choose the name other players see
      </label>
      <div className="flex gap-2">
        <input
          id="leaderboard-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          placeholder={user.name}
          className="field min-w-0 flex-1 py-2"
        />
        <button type="submit" disabled={name.trim().length < 2 || state.status === 'saving'} className="btn-quiet btn-sm shrink-0">
          {state.status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-white">{state.message}</p>
      )}
    </form>
  );
}
