# Infinite Five-in-a-Row (`five-in-a-row`)

« Morpion infini » — « Alignez cinq symboles sur une grille sans limite. » Two players online,
without a clock. Rules version `five-in-a-row-1` (`engine/game.ts`, recorded in every game).

## Rules

- Two players, X and O; X moves first. Symbols are drawn at random for a room's first game and
  swapped at every rematch.
- Each turn a player places one symbol on any free cell. Placed symbols never move and are never
  replaced. There is no need to play near other symbols.
- The first unbroken run of five or more identical symbols — horizontal, vertical or either
  diagonal — wins. An empty cell or an opponent's symbol breaks a run; six or more also wins.
- The grid has no edge in any direction, negative coordinates included. There is no limit on rows,
  columns or moves, and no draw: a game ends with five in a row, a resignation, or a forfeit
  (leaving or staying away past the grace period, a connection policy separate from the rules).

## The unbounded grid

- A cell is an integer pair `(x, y)` of any size, held as `BigInt` and sent as canonical decimal
  strings. Parsing normalises every spelling (`"007"`, `"-0"`) to one key, so a cell never has two.
- Only occupied cells are stored (`cells`, keyed `"x,y"`), plus an index of 32×32 blocks (`chunks`)
  used to read the cells of a visible area. Memory grows with the number of moves, never with the
  distance between them.
- After a placement the engine checks only the four axes through the new symbol, counting identical
  symbols both ways (at most four each way decide the win; the whole run is walked only to report
  it). The reported line is deterministic: the first winning axis in the order horizontal,
  vertical, diagonal, anti-diagonal. Several lines at once still end the game once.
- A rejected placement changes nothing; an accepted one updates the state in constant time.
- Message bounds, not board edges: a coordinate may have at most 400 decimal digits
  (`MAX_COORDINATE_DIGITS`), and one area request covers at most 256 × 256 cells
  (`MAX_AREA_SPAN`); any area anywhere can be requested.

## Multiplayer (`five.service.ts`, `five.gateway.ts`)

Events and payloads are defined in `five.types.ts`; every client → server event is answered
through the Socket.IO acknowledgement.

- A signed-in session is required to create, join or rejoin (`AUTH_REQUIRED`; a guest account is
  fine). A room has two seats. Seat 0 is the creator; the free seat is taken by `five:join` or
  through an invitation (`invite:send` with `game: 'five-in-a-row'`, capacity 2, exactly like
  draughts).
- The game starts by itself once both seats are filled and both players are connected and ready
  (`five:ready { ready: true }`). X moves first.
- Symbols: seat 0's symbol (`seat0Symbol`) is drawn at random when the room's first game starts,
  then swapped by every `five:rematch`. Every game, rematches included, gets a new game id
  (`createGame(randomUUID())`) and starts empty; `gamePlayers` records seat → symbol → account for
  the game being played, so the result is right even if someone leaves.
- Seats: taken back only by the same account **and** the same browser key (`playerKey`). A new tab
  of the same browser takes the seat and the old socket gets `five:seatLost`; another device of the
  same account never does (`ALREADY_SEATED` on join, `NOT_SEATED` on rejoin).
- `five:place { roomId, gameId, version, requestId, x, y }` and `five:resign { roomId, gameId,
  version, requestId }`. Checked in this order: the seat (`NOT_SEATED`), the request id
  (`/^[A-Za-z0-9_-]{8,64}$/`, else `BAD_REQUEST_ID`; a repeated id gets its original answer and is
  never applied twice, the last 30 answers per player are kept with the room), the game id
  (`OLD_GAME` unless it is the room's current game), a game in progress (`NOT_PLAYING`), the pause
  (`PAUSED`, placements only), the version (`STALE_STATE` with the current `version`), then the
  engine (`NOT_YOUR_TURN`, `BAD_CELL`, `CELL_TAKEN`). The symbol always comes from the seat; the
  server works out the win. `OLD_GAME`, `NOT_PLAYING`, `PAUSED` and `STALE_STATE` are not
  remembered, so the same request can go through later; the engine's refusals are. Each room's
  changes run one at a time, so of two placements sent at the same version only one is applied.
- A placement answers `{ ok: true, version, move }` and is broadcast to the room as **one**
  `five:move` event (`FiveMoveEvent`: the move, the new version, turn, status, winner, winning
  line) — never the history or the board, so its size does not grow with the game. `five:room`
  (seats, outcome, pause and a bounded `summary()` with the last 40 moves) is sent on seat, status,
  pause and end-of-game changes only; when a placement ends the game, `five:move` comes first, then
  `five:room`.
- Pause: `five:pause` / `five:resume` as in the other room games; resigning still works while
  paused.
- Disconnection: the seat is kept and the view shows `connected: false` with `graceEndsAt`.
  `ROOM_GRACE_FIVE_MS` while a game is being played (default 3 minutes), `ROOM_GRACE_LOBBY_MS`
  otherwise (default 5 minutes). When the grace ends, or on `five:leave` during a game: once a move
  has been played the game is forfeited (reason `forfeit`, the opponent wins) and recorded; before
  the first move the room goes back to the lobby and nothing is recorded.
- A code that belongs to another game answers `WRONG_GAME` with `params.gameType`; the other games
  answer the same for a five-in-a-row code, and Joda Memory answers
  `{ success: false, error: 'Wrong game', gameType: 'five-in-a-row' }`.
- Tutorial: `five:tutorial { step }` → `{ ok: true, step: { id, index, total, game, stones } }` and
  `five:tutorialCheck { step, cell: { x, y } }` → the engine's `TutorialCheck`; an unknown step
  answers `{ ok: false, code: 'BAD_REQUEST' }`.
- Rate limits per socket: create/join/rejoin 20 a minute; place/resign 10 a second;
  area/history/since together 20 a second; ready/pause/resume/rematch/leave 20 per 10 s; tutorial
  20 a second (`RATE_LIMITED`).

## Sync: loading the board and catching up

Clients never receive the whole board. They read what they need, from the current game only
(`OLD_GAME` for any other game id, including after a rematch); a seated player may read a finished
game until the rematch.

- `five:area { roomId, gameId, from: {x,y}, to: {x,y} }` → `{ gameId, version, cells: [{ x, y, symbol }] }`:
  the occupied cells of the rectangle, corners inclusive and in any order. Each side may cover at
  most `MAX_AREA_SPAN` (256) cells, measured with BigInt (`AREA_TOO_LARGE` beyond); a corner that is
  not a valid coordinate answers `BAD_CELL`. Works anywhere, negative or hundreds of digits long.
- `five:history { roomId, gameId, beforePly?, limit? }` → `{ moves, hasMore }`: the moves numbered
  below `beforePly` (all of them when it is left out), newest first, `limit` clamped to 1 …
  `MAX_HISTORY_PAGE` (200, the default). `hasMore` says older moves remain; the next page asks
  `beforePly` = the last move's `ply`. A `beforePly` below 1 or a non-integer answers `BAD_REQUEST`.
- `five:since { roomId, gameId, version }` → what a client at `version` missed:
  `{ gameId, version, moves, turn, status, winner, reason, winLine }`, with `version` the current one.
  The game version is 1 + the moves played, plus 1 once when the game ends by resignation or forfeit
  (no move can follow). A client at version `v` has therefore seen the first `min(v − 1, moves)`
  moves, and `moves` holds every later one in order (empty when up to date). When more than
  `MAX_CATCH_UP` (500) moves were missed, or `v` is ahead of the server, the answer is
  `{ gameId, version, resync: true }`: reload the visible area and the room. A `version` below 1 or
  not an integer answers `BAD_REQUEST`.
- A client applies a `five:move` only when its version is its own + 1; on a gap (or after
  `STALE_STATE`) it asks `five:since`.

## Persistence

Rooms live in the memory of one backend process with a write-through copy in Redis when
`REDIS_URL` is set (run exactly one backend instance). Only occupied cells and the moves are kept,
so a room's size grows with the moves, never with the distance between them. A stored room is
loaded through `restoreGame`, which rebuilds the 32×32 block index from the cells and checks the
state; a game that fails its checks is dropped and the room goes back to the lobby, keeping its
seats and unsaved results. After a restart every player shows as disconnected until they rejoin.

## Results

A finished game is written once, by `FiveResults.save`, in one nested create (one transaction)
keyed by the game id:

- `games`: `id` = game id, `game_type = 'five-in-a-row'`, `status = 'completed'`, `player1_id` =
  X's account, `player2_id` = O's account, `winner_id` = the winner's account, `started_at` /
  `completed_at`, and `settings = { rulesVersion, reason, winnerSymbol, moves (count), winLine }`
  (`winLine` is `null` unless the game ended with five).
- `game_participants`: one row per player with its `seat`, `team` = 0 for X / 1 for O, the name it
  played under, `result` = `win` | `loss` and `points` 1 / 0.
- `game_moves`: one row per move (`ply`, `symbol`, `x`, `y` as canonical decimal strings). The
  unique keys (game, ply) and (game, x, y) rule out a repeated move number or cell.

`findUnique` first, so a retry finds the row and does nothing; a concurrent duplicate fails on the
key (`P2002`) and counts as stored once the row is found. A finished game waits in the room's saved
`pendingResults` until it is written; it is retried a few times, again at every restart, and
survives a rematch. A game abandoned before any move records nothing.

## Profile statistics and history

`GET /api/users/me/stats` gains a `five` block (there is no draw):

```
{ gamesPlayed, wins, losses, winRate, currentStreak, bestStreak,
  asX: { gamesPlayed, wins, losses }, asO: { gamesPlayed, wins, losses } }
```

`winRate` = wins / gamesPlayed × 100, rounded to 0.1 (0 with no games); `currentStreak` /
`bestStreak` count consecutive wins, newest first.

`GET /api/users/me/history?game=five-in-a-row` (cursor pagination like draughts, `cursor` = the last
row's `id`, `nextCursor` in the answer):

```
{ items: [{ id, result: 'win' | 'loss', symbol: 'X' | 'O', opponent: { name } | null,
            reason: 'five' | 'resignation' | 'forfeit', moves, finishedAt, forfeit }], nextCursor }
```
