# Multiplayer Game Platform - Implementation Plan

**Status:** Draft
**Created:** 2026-10-27
**Target:** MVP with Memory Match Game

---

## Executive Summary

Build a free-to-play, web-based multiplayer gaming platform starting with a 2-player memory matching game. The platform supports both guest and registered users with flexible invitation systems (share links, room codes, friend invites). Initial deployment targets <100 concurrent users on a single-server architecture.

---

## Requirements Summary

### Platform Requirements
- **User Types:** Guest users (no signup) and registered users (optional accounts)
- **Authentication:** Hybrid approach - allow guest play with optional registration
- **Game Hosting:** Web-based, accessible via browser on any device
- **Multiplayer:** Real-time 2-player games (remote or co-located)
- **Invitation Methods:**
  - Share link (all users)
  - Room codes (all users)
  - Friend invites (registered users only)
- **Monetization:** Fully free initially, ads planned for future
- **Scale:** <100 concurrent users, single-server deployment

### Memory Match Game Requirements
- **Players:** 2 players, turn-based
- **Card Configuration:**
  - Minimum 6 cards (must be even number)
  - Players choose card count at game start
  - Cards contain random paired images
- **Game Mechanics:**
  - Player flips 2 cards per turn
  - Match → cards disappear, player scores +1, continues turn
  - No match → turn ends, cards flip back
  - Visibility toggle: opponent can see/not see failed matches
- **Scoring:** Track matches per round
- **Win Condition:** Best of 7 rounds - first to win 4 rounds wins the match
- **Difficulty Levels:** Easy, Normal, Hard (deferred for future implementation)

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS or styled-components
- **State Management:** React Context + Zustand (for game state)
- **Real-time:** Socket.io-client

### Backend
- **Framework:** NestJS
- **Language:** TypeScript
- **API:** REST + WebSocket (Socket.io)
- **Authentication:** JWT + Passport.js
- **Validation:** class-validator, class-transformer

### Database & Cache
- **Primary Database:** PostgreSQL 15+
- **ORM:** TypeORM or Prisma
- **Cache:** Redis 7+
- **Session Store:** Redis (for Socket.io)

### Infrastructure
- **Deployment:** Single VPS (DigitalOcean, Linode, or AWS EC2)
- **Reverse Proxy:** Nginx
- **Process Manager:** PM2
- **Domain & SSL:** Let's Encrypt (free SSL)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                         │
│  Next.js App (SSR/SSG) + Socket.io Client               │
│  - Guest/Registered User UI                              │
│  - Game Lobby & Matchmaking                              │
│  - Memory Match Game Canvas                              │
└─────────────────────────────────────────────────────────┘
                           │
                    HTTPS + WSS
                           │
┌─────────────────────────────────────────────────────────┐
│                  NGINX (Reverse Proxy)                   │
│  - SSL Termination                                       │
│  - Static Asset Serving                                  │
│  - Load Balancing (future)                               │
└─────────────────────────────────────────────────────────┘
                           │
              ├────────────┴────────────┤
              │                         │
┌─────────────▼──────────┐   ┌─────────▼──────────┐
│   Next.js Server       │   │  NestJS Backend    │
│   (Port 3000)          │   │  (Port 4000)       │
│  - SSR/API Routes      │   │  - REST API        │
│  - Auth Pages          │   │  - WebSocket       │
└────────────────────────┘   │  - Game Logic      │
                             │  - Auth Service    │
                             └────────────────────┘
                                      │
                        ├─────────────┴─────────────┤
                        │                           │
              ┌─────────▼────────┐      ┌──────────▼─────────┐
              │   PostgreSQL     │      │      Redis         │
              │  - Users         │      │  - Sessions        │
              │  - Games         │      │  - Game Rooms      │
              │  - Match History │      │  - Active Matches  │
              │  - Friendships   │      │  - Leaderboards    │
              └──────────────────┘      └────────────────────┘
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255), -- NULL for guest users
  is_guest BOOLEAN DEFAULT false,
  display_name VARCHAR(100),
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email)
);
```

### Games Table
```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type VARCHAR(50) NOT NULL, -- 'memory_match'
  room_code VARCHAR(6) UNIQUE,
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, in_progress, completed, abandoned
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  settings JSONB, -- {cardCount: 12, visibilityEnabled: true}
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_room_code (room_code),
  INDEX idx_status (status)
);
```

### Game Rounds Table
```sql
CREATE TABLE game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  player1_score INT DEFAULT 0,
  player2_score INT DEFAULT 0,
  winner_id UUID REFERENCES users(id),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  UNIQUE(game_id, round_number)
);
```

### Friendships Table
```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, blocked
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);
```

### Match History Table
```sql
CREATE TABLE match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES users(id),
  result VARCHAR(10), -- 'win', 'loss', 'draw'
  rounds_won INT DEFAULT 0,
  rounds_lost INT DEFAULT 0,
  total_score INT DEFAULT 0,
  played_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_played_at (played_at)
);
```

---

## Redis Data Structures

### Active Game Rooms
```
Key: game:room:{roomCode}
Type: Hash
Fields:
  - gameId: UUID
  - player1SocketId: string
  - player2SocketId: string
  - status: 'waiting' | 'in_progress' | 'completed'
  - settings: JSON string
TTL: 24 hours
```

### Game State (In-Memory)
```
Key: game:state:{gameId}
Type: Hash
Fields:
  - currentRound: number
  - currentTurn: 'player1' | 'player2'
  - cardGrid: JSON array of card states
  - player1Score: number
  - player2Score: number
  - roundsWon: {player1: number, player2: number}
TTL: 4 hours
```

### Socket Sessions
```
Key: socket:session:{socketId}
Type: Hash
Fields:
  - userId: UUID
  - username: string
  - gameId: UUID (if in game)
TTL: 2 hours
```

### Online Users Count
```
Key: stats:online_users
Type: String
Value: number
TTL: 60 seconds (refreshed on each connection)
```

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create registered account
- `POST /api/auth/login` - Login (returns JWT)
- `POST /api/auth/guest` - Create guest session (returns temporary JWT)
- `POST /api/auth/logout` - Invalidate session
- `GET /api/auth/me` - Get current user info

### Users
- `GET /api/users/:id` - Get user profile
- `PATCH /api/users/:id` - Update profile (registered users only)
- `GET /api/users/:id/stats` - Get user statistics
- `GET /api/users/:id/history` - Get match history

### Friends (Registered Users Only)
- `GET /api/friends` - List friends
- `POST /api/friends/invite` - Send friend request
- `POST /api/friends/:id/accept` - Accept friend request
- `DELETE /api/friends/:id` - Remove friend

### Games
- `POST /api/games/create` - Create new game (returns room code + game ID)
- `POST /api/games/join/:roomCode` - Join game by room code
- `GET /api/games/:id` - Get game details
- `GET /api/games/active` - List active games (for lobby)

### Leaderboard
- `GET /api/leaderboard/global` - Top 100 players by total wins
- `GET /api/leaderboard/weekly` - Top 100 players this week

---

## WebSocket Events

### Connection Events
- `connection` - Client connects
- `disconnect` - Client disconnects
- `authenticate` - Client sends JWT for authentication

### Lobby Events
- `createGame` - Create new game room
  - Emit: `gameCreated` → {gameId, roomCode, shareLink}
- `joinGame` - Join game by room code or game ID
  - Emit: `gameJoined` → {gameId, opponent, settings}
  - Emit to opponent: `opponentJoined` → {opponent}
- `inviteFriend` - Invite friend to game (registered users)
  - Emit to friend: `gameInvitation` → {gameId, inviter, shareLink}

### Game Events
- `startGame` - Both players ready, start game
  - Emit to both: `gameStarted` → {cardGrid, firstTurn, roundNumber}
- `flipCard` - Player flips a card
  - Emit to both: `cardFlipped` → {cardIndex, playerId, cardValue, isVisible}
- `matchFound` - Player matched two cards
  - Emit to both: `cardsMatched` → {cardIndices, playerId, newScore}
- `turnEnd` - Player's turn ends
  - Emit to both: `turnEnded` → {nextTurn, scores}
- `roundEnd` - All cards cleared
  - Emit to both: `roundEnded` → {winner, scores, roundsWon}
- `gameEnd` - Match completed (4 rounds won)
  - Emit to both: `gameCompleted` → {winner, finalScores, matchHistory}
- `toggleVisibility` - Toggle opponent visibility setting
  - Emit to both: `visibilityChanged` → {enabled}

### Error Events
- `error` - Generic error message
- `gameNotFound` - Room code invalid
- `gameFull` - Game already has 2 players
- `unauthorized` - Invalid JWT or permissions

---

## Implementation Steps

### Phase 1: Project Setup & Infrastructure (Week 1)
1. **Initialize Repositories**
   - Create monorepo structure (Turborepo or Nx) OR separate repos
   - Setup Next.js frontend project
   - Setup NestJS backend project
   - Configure TypeScript, ESLint, Prettier

2. **Setup Development Environment**
   - Docker Compose for PostgreSQL + Redis
   - Configure environment variables (.env files)
   - Setup database migrations (TypeORM or Prisma)
   - Configure hot-reload for both frontend/backend

3. **Deploy Infrastructure**
   - Provision VPS (2GB RAM, 1 vCPU minimum)
   - Install Node.js, PostgreSQL, Redis, Nginx, PM2
   - Configure firewall (UFW)
   - Setup domain + SSL (Let's Encrypt)

**Acceptance Criteria:**
- [ ] Development environment runs with `docker-compose up`
- [ ] Frontend accessible at localhost:3000
- [ ] Backend API responds at localhost:4000
- [ ] Database migrations run successfully
- [ ] Production server accessible via HTTPS

**Verification:**
- `curl https://yourdomain.com/api/health` returns 200 OK
- Redis connection test passes
- PostgreSQL connection test passes

---

### Phase 2: Authentication System (Week 2)
1. **Backend Auth Module**
   - Implement JWT strategy with Passport.js
   - Create guest user generation (temporary UUIDs)
   - Create registered user registration (username, email, password)
   - Implement login/logout endpoints
   - Add JWT refresh token mechanism

2. **Frontend Auth Pages**
   - Login page (Next.js route)
   - Registration page
   - Guest "Play Now" button (auto-creates guest user)
   - Auth context provider (React Context)
   - Protected routes HOC

3. **Session Management**
   - Store JWT in httpOnly cookies
   - Redis session storage for Socket.io
   - Implement "Convert Guest to Registered" flow

**Acceptance Criteria:**
- [ ] Guest users can play without signup
- [ ] Registered users can create accounts and login
- [ ] JWT tokens expire after 24 hours
- [ ] Refresh tokens work correctly
- [ ] Guests can convert to registered accounts

**Verification:**
- Manual test: Create guest account → play game → convert to registered
- Unit tests for auth service (>80% coverage)
- Integration test: Full registration → login → access protected endpoint

---

### Phase 3: User Management & Friends System (Week 3)
1. **User Profile Management**
   - GET/PATCH user profile endpoints
   - Avatar upload (store URLs, use external service like Cloudinary)
   - Username change validation (uniqueness check)

2. **Friends System (Registered Users)**
   - Send friend request
   - Accept/reject friend request
   - Remove friend
   - List friends with online status
   - Friend search by username

3. **Frontend UI**
   - User profile page
   - Friends list component
   - Friend request notifications
   - Search users component

**Acceptance Criteria:**
- [ ] Users can update profile (display name, avatar)
- [ ] Friend requests work bidirectionally
- [ ] Online status shows in friends list
- [ ] Can search users by username

**Verification:**
- Test with 2 accounts: send request → accept → see online status
- Verify database constraints (no duplicate friendships)

---

### Phase 4: Game Lobby & Matchmaking (Week 4)
1. **Game Creation & Joining**
   - POST /api/games/create endpoint
   - Generate unique 6-digit room codes
   - POST /api/games/join/:roomCode endpoint
   - Share link generation (https://yourdomain.com/join/{roomCode})

2. **WebSocket Lobby**
   - Socket.io server setup in NestJS
   - `createGame` event handler
   - `joinGame` event handler
   - `inviteFriend` event handler (for registered users)
   - Room state management in Redis

3. **Frontend Lobby UI**
   - "Create Game" button
   - Game settings modal (card count selection)
   - Room code display + copy button
   - Share link display + copy button
   - "Join by Code" input
   - Friend invite list (registered users)
   - Waiting room (shows when opponent joins)

**Acceptance Criteria:**
- [ ] User can create game and receive room code
- [ ] Share link works for both guest and registered users
- [ ] Room codes are unique and expire after 24 hours
- [ ] Opponent joins via room code or link
- [ ] Friend invites deliver notifications

**Verification:**
- Test flow: Create game → copy link → open in incognito → join via link
- Verify Redis room state persists correctly
- Test room code collision (should be virtually impossible with 6 digits)

---

### Phase 5: Memory Match Game - Backend Logic (Week 5)
1. **Game Engine Module**
   - Initialize card grid with paired images
   - Shuffle algorithm (Fisher-Yates)
   - Flip card validation (turn-based logic)
   - Match detection (compare two flipped cards)
   - Scoring system (increment on match)
   - Turn switching logic
   - Round completion detection (all cards matched)
   - Match completion detection (4 rounds won)

2. **WebSocket Game Events**
   - `startGame` - Initialize first round
   - `flipCard` - Handle card flip request
   - `matchFound` - Broadcast match to both players
   - `turnEnd` - Switch turns
   - `roundEnd` - Start next round or end match
   - `gameEnd` - Save match history, update stats
   - `toggleVisibility` - Toggle opponent visibility

3. **Game State Management**
   - Store active game state in Redis
   - Persist rounds to PostgreSQL
   - Save final match history

**Acceptance Criteria:**
- [ ] Card grid shuffles randomly each round
- [ ] Match detection works correctly
- [ ] Scoring increments on match
- [ ] Player keeps turn on match
- [ ] Turn switches on non-match
- [ ] Round ends when all cards cleared
- [ ] Match ends after 4 rounds won
- [ ] Visibility toggle works correctly

**Verification:**
- Unit tests for game engine (100% coverage)
- Integration test: Simulate full match with 2 clients
- Edge case test: Player disconnects mid-game (handle gracefully)

---

### Phase 6: Memory Match Game - Frontend UI (Week 6)
1. **Game Canvas Component**
   - Responsive card grid (CSS Grid)
   - Card flip animation (CSS transitions)
   - Card face/back images
   - Disable cards during opponent's turn
   - Highlight matched cards
   - Remove matched cards from grid

2. **Game HUD (Heads-Up Display)**
   - Player names + avatars
   - Current scores
   - Rounds won indicator (e.g., "You: 2 | Opponent: 1")
   - Turn indicator ("Your Turn" / "Opponent's Turn")
   - Visibility toggle button
   - Timer (future enhancement)

3. **Game Flow Screens**
   - Settings screen (choose card count)
   - Waiting screen (waiting for opponent)
   - Round transition screen ("Round 2 - Your Score: 5 | Opponent: 3")
   - Victory/defeat screen
   - Match summary (total rounds, scores, winner)

4. **Socket.io Client Integration**
   - Connect to backend WebSocket
   - Listen for game events
   - Emit flip card events
   - Handle disconnections gracefully

**Acceptance Criteria:**
- [ ] Card grid renders correctly for 6, 8, 10, 12+ cards
- [ ] Flip animation is smooth (<300ms)
- [ ] Cards disable during opponent's turn
- [ ] Matched cards disappear with animation
- [ ] Scores update in real-time
- [ ] Visibility toggle works as expected
- [ ] Game handles network latency (<100ms)

**Verification:**
- Test on desktop, tablet, mobile (responsive)
- Test with slow network (throttle to 3G)
- Test with 2 players in different locations
- Accessibility audit (keyboard navigation, screen reader)

---

### Phase 7: Match History & Statistics (Week 7)
1. **Backend Statistics**
   - Calculate win rate, total games, total rounds won
   - GET /api/users/:id/stats endpoint
   - GET /api/users/:id/history endpoint (paginated)
   - Leaderboard queries (top 100 by wins)

2. **Frontend Statistics Pages**
   - User profile stats page
   - Match history table (date, opponent, result, score)
   - Global leaderboard page
   - Weekly leaderboard page

**Acceptance Criteria:**
- [ ] Stats calculate correctly (win rate, total games)
- [ ] Match history shows last 50 games
- [ ] Leaderboards update in real-time
- [ ] Registered users can view their full history
- [ ] Guests see "Sign up to save your history" message

**Verification:**
- Play 10 games, verify stats accuracy
- Check leaderboard updates after each game

---

### Phase 8: Polish & Testing (Week 8)
1. **UI/UX Polish**
   - Loading states for all async operations
   - Error messages (toast notifications)
   - Success messages (game created, friend added)
   - Animations (page transitions, card flips)
   - Sound effects (optional: card flip, match, victory)

2. **Testing**
   - Unit tests (backend services: >80% coverage)
   - Integration tests (API endpoints: >70% coverage)
   - E2E tests (Playwright or Cypress: critical flows)
   - Load testing (Artillery or k6: 100 concurrent users)

3. **Performance Optimization**
   - Optimize database queries (add indexes)
   - Implement Redis caching for leaderboards
   - Minify frontend assets
   - Enable Nginx gzip compression
   - Implement rate limiting (prevent DDoS)

4. **Documentation**
   - API documentation (Swagger/OpenAPI)
   - Setup guide for developers
   - Deployment guide
   - User guide (how to play)

**Acceptance Criteria:**
- [ ] All critical flows tested with E2E tests
- [ ] Backend passes >80% code coverage
- [ ] Load test passes at 100 concurrent users
- [ ] Lighthouse score >90 for performance
- [ ] API documentation complete

**Verification:**
- Run full test suite: `npm run test`
- Load test: `npm run load-test`
- Lighthouse audit on production

---

### Phase 9: Deployment & Launch (Week 9)
1. **Production Deployment**
   - Setup CI/CD pipeline (GitHub Actions)
   - Deploy Next.js to Vercel (frontend) OR VPS with PM2
   - Deploy NestJS backend to VPS with PM2
   - Configure Nginx reverse proxy
   - Enable SSL with Let's Encrypt
   - Setup database backups (automated daily backups)

2. **Monitoring & Logging**
   - Setup error tracking (Sentry or Rollbar)
   - Setup logging (Winston + file rotation)
   - Setup uptime monitoring (UptimeRobot or Pingdom)
   - Setup analytics (Google Analytics or Plausible)

3. **Launch Checklist**
   - Test production environment
   - Verify SSL certificate
   - Test game flow end-to-end on production
   - Invite beta testers (5-10 users)
   - Collect feedback and fix critical bugs

**Acceptance Criteria:**
- [ ] Production site accessible via HTTPS
- [ ] All features work on production
- [ ] Error tracking captures exceptions
- [ ] Uptime monitoring alerts on downtime
- [ ] Beta testers successfully play games

**Verification:**
- Beta test with 10 users, collect feedback
- Monitor error logs for 48 hours
- Verify database backups run daily

---

## Risks and Mitigations

### Risk 1: WebSocket Connection Drops During Game
**Impact:** Players disconnect mid-game, losing progress
**Mitigation:**
- Implement auto-reconnect logic in Socket.io client
- Store game state in Redis (survives brief disconnections)
- Freeze game for 30 seconds if player disconnects, then forfeit
- Show "Opponent disconnected" message with countdown

### Risk 2: Room Code Collisions
**Impact:** Two games assigned same room code
**Mitigation:**
- Use 6-digit alphanumeric codes (62^6 = 56 billion combinations)
- Check uniqueness before creating room
- Add database unique constraint on room_code

### Risk 3: Cheating via Socket Events
**Impact:** Malicious client sends invalid moves (flip 3 cards, flip during opponent's turn)
**Mitigation:**
- Server-side validation for all game actions
- Verify turn ownership before processing flip
- Rate limit socket events (max 10 flips per second)
- Ban users with repeated violations

### Risk 4: Guest User Data Loss
**Impact:** Guest users lose all progress on browser refresh
**Mitigation:**
- Clearly communicate "Sign up to save progress"
- Offer "Convert to Account" button after each game
- Store guest session in localStorage (temporary, best-effort)

### Risk 5: Single Server Failure
**Impact:** Platform goes offline if VPS crashes
**Mitigation:**
- Setup automated server monitoring + alerts
- Implement database backups (restore within 1 hour)
- Document recovery process
- Plan for horizontal scaling when >80% capacity

### Risk 6: COPPA Compliance (if kids play)
**Impact:** Legal liability if collecting data from users <13
**Mitigation:**
- Add age gate on registration ("I am 13 or older")
- Do not collect unnecessary personal data
- Provide parent consent mechanism if targeting kids
- Consult legal advisor for compliance

---

## RALPLAN-DR Summary

### Principles
1. **Accessibility First:** Guest users can play without signup to minimize friction
2. **Scalable Foundation:** Start simple, architect for future growth (horizontal scaling)
3. **Real-time Reliability:** WebSocket connections must handle network instability gracefully
4. **Fair Play:** Server-side validation prevents cheating and ensures game integrity
5. **Progressive Enhancement:** Basic features work for all, advanced features reward registration

### Decision Drivers
1. **User Retention:** Hybrid auth (guest + registered) maximizes reach while enabling retention
2. **Development Speed:** Proven tech stack (Next.js, NestJS, PostgreSQL) reduces unknowns
3. **Cost Efficiency:** Single-server deployment keeps costs <$20/month for <100 concurrent users

### Viable Options Considered

#### Option A: Monolithic Architecture (Next.js Full-Stack)
**Approach:** Use Next.js API routes for backend instead of separate NestJS server
**Pros:**
- Simpler deployment (single app)
- Fewer moving parts
- Lower learning curve

**Cons:**
- WebSocket support in Next.js is non-standard (requires custom server)
- Harder to scale backend independently
- Less separation of concerns

**Invalidation Rationale:** The user explicitly requested NestJS for backend, indicating preference for separation and NestJS features (dependency injection, modules). Next.js API routes are insufficient for complex WebSocket game logic.

#### Option B: Microservices Architecture
**Approach:** Separate services for auth, game logic, matchmaking
**Pros:**
- Independent scaling
- Technology flexibility
- Fault isolation

**Cons:**
- Overkill for <100 concurrent users
- Increased complexity (service discovery, inter-service communication)
- Higher infrastructure costs

**Invalidation Rationale:** User specified "small start, simple single-server deployment," ruling out microservices complexity. This architecture is reserved for future scaling.

#### Option C: Selected - Modular Monolith with NestJS
**Approach:** Single NestJS backend with modular structure, separate Next.js frontend
**Pros:**
- Clear separation of concerns (frontend/backend)
- Easy to scale horizontally later (add more backend instances)
- NestJS modules provide structure without microservices overhead
- Socket.io integrates natively with NestJS

**Cons:**
- Requires managing two separate deployments
- Slightly more complex than full-stack Next.js

**Why Chosen:** Balances simplicity for MVP with architectural flexibility for growth. Matches user's tech stack preferences (Next.js + NestJS). Supports real-time requirements with Socket.io.

---

## Architecture Decision Record (ADR)

### Decision
Build a modular monolith with separate Next.js frontend and NestJS backend, communicating via REST API and WebSocket (Socket.io).

### Drivers
1. User explicitly requested Next.js (frontend) + NestJS (backend) + Socket.io (real-time)
2. Need robust WebSocket support for real-time 2-player games
3. Start simple (<100 users) but enable future horizontal scaling
4. Separation of concerns improves maintainability

### Alternatives Considered
1. **Next.js Full-Stack (API Routes):** Rejected due to poor WebSocket support and user's preference for NestJS
2. **Microservices:** Rejected as over-engineered for initial scale; deferred for future
3. **Serverless (Vercel + AWS Lambda):** Rejected due to WebSocket limitations in serverless environments

### Consequences
**Positive:**
- Clean architecture enables independent scaling of frontend/backend
- NestJS dependency injection and modules improve code organization
- Socket.io provides battle-tested real-time communication
- Easy to add more game types (reuse backend modules)

**Negative:**
- Two separate deployments increase operational complexity
- Need to manage CORS between frontend and backend
- Requires more infrastructure than monolithic Next.js app

### Follow-Ups
1. Implement health check endpoints for monitoring
2. Add database connection pooling to handle concurrent games
3. Setup Redis Pub/Sub for multi-server Socket.io (when scaling)
4. Document deployment process for future team members

---

## Next Steps After Plan Approval

1. **Initialize Project Structure**
   - Create GitHub repository (or monorepo)
   - Setup Next.js + NestJS projects
   - Configure Docker Compose for local development

2. **Execute Phase 1** (Project Setup & Infrastructure)
   - Follow implementation steps in Phase 1
   - Verify acceptance criteria
   - Run verification tests

3. **Iterate Through Phases 2-9**
   - Complete each phase sequentially
   - Review acceptance criteria before moving to next phase
   - Conduct weekly progress reviews

4. **Launch MVP**
   - Beta test with 10 users
   - Collect feedback
   - Fix critical bugs
   - Announce public launch

---

## Future Enhancements (Post-MVP)

1. **Additional Games:** Tic-tac-toe, Connect-4, Checkers, Word games
2. **Difficulty Levels:** Implement time limits, varying card counts
3. **Tournaments:** Bracket-style competitions
4. **Ads Integration:** Google AdSense or custom ad server
5. **Premium Features:** Custom avatars, themes, ad-free experience
6. **Mobile Apps:** React Native for iOS/Android
7. **Spectator Mode:** Friends can watch live games
8. **Replays:** Save and watch past games
9. **Achievements & Badges:** Gamification elements
10. **Horizontal Scaling:** Load balancer + multiple backend instances

---

**Status:** Pending Approval
**Next Action:** Review plan → Approve → Begin Phase 1
