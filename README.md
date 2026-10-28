# 🎮 Joda Fun - Multiplayer Gaming Platform

A modern, real-time multiplayer gaming platform built with Next.js 15, NestJS, and Socket.io. Currently featuring **Joda Memory**, a beautiful card-matching memory game with stunning visuals.

## ✨ Features

### 🎯 Joda Memory Game
- **Solo Challenge Mode**: Play against yourself, improve your skills
- **Beautiful Image-Based Cards**: 70+ curated high-quality images
- **Random Image Selection**: Different images every game
- **Round-Based Gameplay**: Continuous rounds with "Next Round" button
- **Game State Persistence**: Resume your game after page refresh
- **Smart UI**: Modern gradient design with glass-morphism effects
- **Sound Effects**: Immersive audio feedback
- **Performance Tracking**: Best time tracking and stats

### 🌐 Platform Features
- **Real-time Multiplayer**: WebSocket-powered live gameplay
- **User Authentication**: Secure guest and permanent accounts
- **Games Library**: Browse available games
- **Leaderboard**: Track top players
- **Responsive Design**: Works on all devices
- **Modern UI/UX**: Tailwind CSS with custom gradients

## 🚀 Tech Stack

### Frontend
- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **Socket.io-client** (WebSocket)
- **Lucide React** (Icons)

### Backend
- **NestJS**
- **Socket.io** (WebSocket)
- **Prisma** (ORM)
- **PostgreSQL**
- **TypeScript**

### Infrastructure
- **Turborepo** (Monorepo)
- **Railway** (Hosting)
- **Custom Domains**: `jodafun.app`, `api.jodafun.app`

## 📦 Project Structure

```
jodafun/
├── game-platform/
│   ├── apps/
│   │   ├── frontend/          # Next.js application
│   │   │   ├── app/
│   │   │   │   ├── components/  # React components
│   │   │   │   ├── games/       # Game pages
│   │   │   │   └── lib/         # Utilities
│   │   │   └── railway.json     # Railway config
│   │   └── backend/           # NestJS API
│   │       ├── src/
│   │       │   ├── game/       # Game gateway (WebSocket)
│   │       │   ├── auth/       # Authentication
│   │       │   └── prisma/     # Database service
│   │       └── railway.json    # Railway config
│   └── packages/             # Shared packages
│       ├── ui/               # Shared UI components
│       ├── typescript-config/
│       └── eslint-config/
├── RAILWAY_DEPLOYMENT.md     # Deployment guide
└── README.md                 # This file
```

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL
- pnpm (recommended) or npm

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/jodelin93/jodafun.git
cd jodafun
```

2. **Install dependencies:**
```bash
cd game-platform
npm install
```

3. **Set up environment variables:**

Create `.env` in `game-platform/apps/backend/`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/jodafun"
JWT_SECRET="your-secret-key-here"
CORS_ORIGIN="http://localhost:3001"
PORT=3000
```

Create `.env.local` in `game-platform/apps/frontend/`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```

4. **Run database migrations:**
```bash
cd apps/backend
npx prisma migrate dev
```

5. **Start development servers:**

**Terminal 1 - Backend:**
```bash
cd game-platform/apps/backend
npm run start:dev
```

**Terminal 2 - Frontend:**
```bash
cd game-platform/apps/frontend
npm run dev
```

6. **Access the application:**
- Frontend: http://localhost:3001
- Backend API: http://localhost:3000
- Backend Health: http://localhost:3000/health

## 🎮 How to Play Joda Memory

1. Visit the platform
2. Click "Play Now" on Joda Memory
3. Choose **Solo Challenge** mode
4. Select difficulty: Easy (8 cards), Medium (16 cards), or Hard (24 cards)
5. Click "Start Game"
6. Match pairs by clicking cards
7. Complete the round and click "Next Round" for new images
8. Track your best time and improve!

## 🚀 Deployment

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy to Railway

1. **Create GitHub repository** and push code
2. **Create Railway project** named "Joda Fun"
3. **Add PostgreSQL** database
4. **Deploy backend:**
   - Root: `game-platform/apps/backend`
   - Add env vars (see deployment guide)
5. **Deploy frontend:**
   - Root: `game-platform/apps/frontend`
   - Add env vars (see deployment guide)
6. **Configure custom domains:**
   - Frontend: `jodafun.app`
   - Backend: `api.jodafun.app`

## 📸 Screenshots

### Home Page
Beautiful gradient design with game cards and quick actions.

### Joda Memory Game
High-quality images with smooth animations and real-time gameplay.

## 🎯 Roadmap

- [ ] More card games (Poker, Uno, etc.)
- [ ] User profiles and avatars
- [ ] Friend system
- [ ] Achievements and badges
- [ ] Tournament mode
- [ ] Mobile app (React Native)
- [ ] Game replays
- [ ] Social features (chat, reactions)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Jodelin Desrameaux** (@jodelin93)

## 🙏 Acknowledgments

- Images from [Picsum Photos](https://picsum.photos) - Free high-quality placeholder images
- Icons from [Lucide](https://lucide.dev)
- Built with [Next.js](https://nextjs.org), [NestJS](https://nestjs.com), and [Railway](https://railway.app)
- AI-assisted development with [Claude Code](https://claude.com/claude-code)

---

**🎮 Generated with [Claude Code](https://claude.com/claude-code)**

Co-Authored-By: Claude <noreply@anthropic.com>
