# International draughts (`international-draughts`)

« Jeu de dames » — Dames internationales · 20 pions. Two players online, friendly games without a
clock.

## Rule version

The engine plays **FMJD Annex 1, "Official FMJD rules for international draughts"**, from the FMJD
Annexes updated **21 August 2024** (`RULES_VERSION = 'FMJD-Annex1-2024-08-21'` in
`engine/rules.ts`). The French FFJD regulation of November 2015 was read alongside it; where the two
differ (art. 6.3 and 6.4, see below) the FMJD text applies. Every game records the version in its
state (`rulesVersion`) and in its saved result (`games.settings.rulesVersion`).

## What the engine enforces

- Board, numbering and start (art. 2): 50 dark squares numbered 1–50 from the top left; black men on
  1–20, white men on 31–50; white moves first (3.3). Each piece has a stable id (`w1`–`w20`,
  `b1`–`b20`) that never changes, including after promotion.
- Moves (art. 3): a man moves one square diagonally forwards (3.4); a king moves any distance over
  free squares (3.9). A man becomes a king only when it **stops** on the far row (3.5, 4.15).
- Captures (art. 4): men capture forwards and backwards (4.1, 4.2); kings capture at a distance and
  land on any free square behind the piece (4.3, 4.6). Capturing is compulsory. Of all routes, only
  those taking the most pieces are legal, a king counting as one piece (4.13); equal routes are all
  allowed (4.14). A whole route is one move. Captured pieces stay on the board until the route ends
  (4.11), so they block and can't be jumped twice (4.8); free squares may be crossed again (4.8).
  The search explores every complete route of every piece before applying the maximum, so no choice
  made part-way can hide a longer route.
- Routes: a client sends the start square and every landing square (`{ from, path }`). The server
  matches that against the legal moves and works out the captured pieces and promotion itself; an
  arrival square alone is never enough, because different routes can end on the same square.
- Result (art. 7): a player loses with no pieces left (7.2.3) or no legal move on their turn
  (7.2.2), by resignation (7.2.1), or by forfeit (leaving or staying away, see below). Draws by
  agreement (7.3.1) and by art. 6.

## Draws (art. 6) and how they are counted

Counters live in the game state and are saved with the room, so a reconnection or a server restart
keeps them. "Moves for each player" are counted in single moves (plies).

- **6.1 repetition** — draw on the **third** occurrence of the same position with the same player to
  move. A position is the piece type and colour on every square plus the side to move
  (`positionKey`); ids, history and display orientation play no part. Positions before the last
  man move or capture can never recur and are forgotten.
- **6.2 kings only** — draw when, for 25 successive moves of each player (50 plies), only kings have
  moved, with no man move and no capture. Any man move or capture restarts the count.
- **6.3 sixteen moves** — when the material becomes three kings, two kings and a man, or a king and
  two men against **one king**, the game is a draw once each player has played 16 more moves (32
  plies). A capture during these moves keeps the 16-move maximum running ("the maximum of 16 moves
  remains valid"): the count is not restarted and does not switch to 6.4.
- **6.3 long diagonal** — the English sentence ("If the player with a king solely occupies the large
  diagonal …") is read as: once the player with the single king occupies the long diagonal
  (squares 5–10–14–19–23–28–32–37–41–46) **alone**, with no other piece on it, each player may play
  at most 5 more moves (10 plies) from that moment, whichever limit comes first.
- **6.4 five moves** — two kings, a king and a man, or one king against **one king**: draw once each
  player has played 5 more moves (10 plies) from the move that created this material.
- **Win first** — after every move the engine first checks whether the opponent has no piece or no
  legal move; that win takes precedence over every draw rule, which is what 6.3 and 6.4 require
  for the last allowed move.
- **Draw offers** — a player may offer a draw; the opponent must accept explicitly. The offer is tied
  to the state version it was made at and any move withdraws it, so an answer to an offer made in an
  earlier position can't end the game (`STALE_DRAW_OFFER` / `NO_DRAW_OFFER`).

## Tutorial

`tutorial.ts`: five positions checked by the engine (a move, a compulsory capture, the maximum
capture, promotion, winning by taking the last piece).

## Multiplayer (`draughts.service.ts`, `draughts.gateway.ts`)

Events and payloads are defined in `draughts.types.ts`; every client → server event is answered
through the Socket.IO acknowledgement.

- A signed-in session is required to create, join or rejoin (`AUTH_REQUIRED`; a guest account is
  fine). A room has two seats. Seat 0 is the creator; the free seat is taken by `draughts:join` or
  through an invitation (`invite:send` with `game: 'international-draughts'`, capacity 2, exactly
  like Joda Casino and Dominoes).
- The game starts by itself as soon as both seats are filled and both players are connected and
  ready (`draughts:ready { ready: true }`). There is no start event.
- Colours: seat 0's colour (`seat0Color`) is drawn at random (`secureRandomInt`) when the room's
  first game starts, then swapped by every `draughts:rematch`. The room view shows each seat's colour
  (`null` until the first game starts; after a game it shows the colours of the next one once the
  rematch has swapped them). If the first game is abandoned before its first move, the drawn colours
  are kept for the next start. `gamePlayers` records seat → colour → account for the game being
  played, so the result is right even if someone leaves. Every game, rematches included, gets a new
  game id (`createGame(randomUUID())`) with every counter reset.
- Seats: a seat is taken back only by the same account **and** the same browser key (`playerKey`).
  A new tab of the same browser takes the seat and the old socket gets `draughts:seatLost`; another
  device of the same account never takes it (`ALREADY_SEATED` on join, `NOT_SEATED` on rejoin).
- Moves: `draughts:move { roomId, version, requestId, from, path }`. The client sends only the start
  square and every landing square; the server parses it (`parseRoute`), checks seat, colour and turn
  itself and works out captures and promotion from the legal moves. Anything else the client sends
  is ignored. A rejected route answers the engine's code (`CAPTURE_REQUIRED`, `MAX_CAPTURE_REQUIRED`,
  `INCOMPLETE_CAPTURE`, `NOT_YOUR_TURN`, `NOT_YOUR_PIECE`, `NO_PIECE`, `ILLEGAL_MOVE`, `BAD_MOVE`) with
  its `params`, and changes nothing.
- Every game action (`move`, `resign`, `offerDraw`, `respondDraw`) names the state version it was
  made against and a request id (`/^[A-Za-z0-9_-]{8,64}$/`, else `BAD_REQUEST_ID`). A stale version
  is answered `STALE_STATE` with the current `version`; re-sync from the latest `draughts:room`. A
  repeated request id gets the original answer and is never applied twice (the last 30 answers per
  player are kept with the room). Each room's changes run one at a time, so of two moves sent at
  the same version only one is applied.
- Draws: `draughts:offerDraw`, then the opponent answers `draughts:respondDraw { offerVersion, accept }`
  with `offerVersion = game.drawOffer.version`. Any move withdraws the offer; answering one that is
  gone or was replaced gives `NO_DRAW_OFFER` / `STALE_DRAW_OFFER`, answering your own `OWN_DRAW_OFFER`.
- Pause: `draughts:pause` / `draughts:resume` as in the other room games (`paused` in the view;
  whoever paused resumes, anyone may once that player is gone or disconnected). While paused, moves
  and draw actions answer `PAUSED` (not remembered, so the same request works after resuming);
  resigning is still allowed.
- Disconnection: the seat is kept and the view shows `connected: false` with `graceEndsAt`.
  `ROOM_GRACE_DRAUGHTS_MS` while a game is being played (default 3 minutes), `ROOM_GRACE_LOBBY_MS`
  otherwise (default 5 minutes). When the grace ends, or when a player sends `draughts:leave` during
  a game: once a move has been played the game is forfeited (`forfeit`, the opponent wins, reason
  `forfeit`) and recorded; before the first move the room goes back to the lobby and nothing is
  recorded. Nobody is ever moved for and there is no clock (friendly games).
- `draughts:rematch` (finished games only, else `NOT_FINISHED`): back to the lobby with the same
  seats, readiness cleared, colours swapped for the next game.
- `draughts:room` goes to everyone in the room after every change: the public board (`publicView`:
  pieces, moves, legal moves for the side to move, art. 6 counters, draw offer, result), the seats,
  the outcome and the pause. Browser keys, socket ids and account ids are never sent.
- A code that belongs to another game answers `WRONG_GAME` with `params.gameType`; Joda Casino and
  Dominoes answer the same for a draughts code, and Joda Memory answers
  `{ success: false, error: 'Wrong game', gameType: 'international-draughts' }`.
- Tutorial: `draughts:tutorial { step }` → `{ ok: true, step: { id, index, total, view } }` and
  `draughts:tutorialCheck { step, route }` → the engine's `TutorialCheck`; an unknown step (anything
  but an integer 0 … total − 1) answers `{ ok: false, code: 'BAD_REQUEST' }`.

## Persistence

Rooms live in the memory of one backend process with a write-through copy in Redis when
`REDIS_URL` is set (see the Dominoes README: run exactly one backend instance). A stored room is
loaded through `restoreGame`; a game that fails its checks is dropped and the room goes back to the
lobby, keeping its seats and unsaved results. After a restart every player shows as disconnected
until they rejoin; the counters (repetitions, king moves, endgame counts) are part of the saved game
state, so a refresh or a restart keeps them.

## Results

A finished game is written once, in one statement keyed by the game id, into the existing tables
(no migration):

- `games`: `id` = game id, `game_type = 'international-draughts'`, `status = 'completed'`,
  `player1_id` = white's account, `player2_id` = black's account, `winner_id` = the winner's account
  or `NULL` for a draw, `started_at` / `completed_at`, and
  `settings = { rulesVersion, reason, winnerColor (null on a draw), moves, notation[], routes[{from, path}], forfeit?: true }`.
  `routes` replays the whole game (`replay()`).
- `game_participants`: one row per player with its `seat`, `team` = 0 for white / 1 for black, the
  name it played under, `result` = `win` | `loss` | `draw` and `points` = match points (FMJD
  tournament scoring: win 2, draw 1, loss 0). No `game_hands` rows.

A finished game waits in the room's saved `pendingResults` until it is written; it is retried a few
times, again at every restart, and survives a rematch. Retries and restarts can't duplicate it.

## Profile statistics and history

`GET /api/users/me/stats` gains a `draughts` block:

```
{ gamesPlayed, wins, draws, losses, winRate, currentStreak, bestStreak,
  asWhite: { gamesPlayed, wins, draws, losses }, asBlack: { gamesPlayed, wins, draws, losses } }
```

- `winRate` = wins / gamesPlayed × 100, rounded to 0.1 (0 with no games). A draw is a game played
  but not won.
- `currentStreak` / `bestStreak` count consecutive **wins**, newest first; a draw ends a winning
  streak exactly like a loss.

The Joda Casino and Dominoes blocks now count `losses` from their `loss` rows and gain `draws`
(always 0 for them today); their numbers are unchanged for existing data.

`GET /api/users/me/history?game=international-draughts` (cursor pagination like the other team
games, `cursor` = the last row's `id`, `nextCursor` in the answer):

```
{ items: [{ id, result: 'win' | 'loss' | 'draw', color: 'white' | 'black', opponent: { name } | null,
            reason, moves, rulesVersion, finishedAt, forfeit }], nextCursor }
```
