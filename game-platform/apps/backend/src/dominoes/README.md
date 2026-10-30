# Dominoes (`dominoes`)

Block dominoes with a double-six set, for two players head to head or four players in two
partnerships. There is no drawing.

The opening and scoring defaults live in `engine/rules.ts` (`DOMINO_RULES`, `RULES_VERSION`). They
can be changed there without rewriting the engine; bump `RULES_VERSION` when you do. Every match
records the version it was played under (`settings.rulesVersion` in the `games` row).

## Rules the engine enforces

Equipment and dealing
- 28 tiles, 0-0 to 6-6. A tile's id is `"a-b"` with `a <= b` (`"3-5"`, `"6-6"`) and never changes;
  which way round it lies on the table is stored on its placement.
- Seats are numbered in anticlockwise order. Play passes from seat n to seat n + 1.
- Modes: `head-to-head` (2 players, one per side) and `partners` (4 players, seats 0+2 against 1+3).
- Every hand the 28 tiles are shuffled (crypto randomness in production) and each player is dealt 7.
  With two players the other 14 tiles stay face down and unused for that hand: nobody sees them,
  nobody draws from them, and they never count in scoring.

Opening
- First hand: the highest double dealt opens, and its holder starts. With two players and no double
  dealt, the heaviest dealt tile opens (ties broken by its higher end). With four players all 28
  tiles are dealt, so 6-6 always opens.
- Later hands: the starting seat moves one place anticlockwise, and that player may open with any tile.

Playing
- A tile is placed at either open end of the chain, touching it with a matching number. A tile that
  fits both ends must name the end. The chain's ends are public; nothing else about the table is.
- A player must play when any tile fits. Passing is allowed only when nothing in the hand fits
  either end (the server checks this against the player's real hand). There is no drawing.

Ending a hand and scoring
- Domino: a player who places their last tile ends the hand, and their side wins it.
- Blocked: after consecutive passes by every player (2 in head-to-head, 4 in partners) nobody can
  play and the hand ends. The side with fewer pips left in hand wins it; equal totals score nothing.
  In partners a side's pips are both partners' pips added together.
- The winning side scores (defaults in `DOMINO_RULES.payout`):
  - head-to-head, domino: the opponent's pips;
  - head-to-head, blocked: the opponent's pips minus the winner's;
  - partners, domino or blocked: the opponents' pips.
- After every completed hand, the side with the most points wins the match once it has reached the
  target score. If the leaders are tied at or above the target, another hand is played.
- Target score: 100 by default, a room setting between 25 and 500 chosen by the host in the lobby,
  fixed once the match starts.

## Multiplayer

- Events and payloads are in `dominoes.types.ts`. Every event is answered through the Socket.IO
  acknowledgement with `{ ok: true, ... }` or `{ ok: false, code, params? }`.
- A player needs a session (a guest account is fine): create, join and rejoin answer
  `AUTH_REQUIRED` otherwise. An account holds at most one seat per room. Reclaiming a seat after a
  refresh or reconnect needs the same signed-in account and the same browser key (`playerKey`);
  another device of the same account can't take the seat over. A new tab of the same browser does
  take it, and the old tab is sent `dominoes:seatLost`.
- Seats: newcomers get the lowest free seat; in the lobby a player may move to another free seat,
  which also chooses their team. Seats, teams and the target are locked while a match is played.
- The host starts the match (`dominoes:start`) once every seat is filled, connected and ready;
  otherwise the answer is `NOT_READY`. Readiness alone never starts a match.
- `dominoes:play` and `dominoes:pass` name the state version they were made against and a unique
  request id (`/^[A-Za-z0-9_-]{8,64}$/`). A stale version is rejected with `STALE_STATE` and the
  current version; a repeated request id gets the original answer and is never applied twice (the
  last 30 answers per player are kept with the room). Each room's changes run one at a time, so two
  moves sent at the same version can never both be applied.
- The server never trusts a client value: tile ownership, which end fits, whether a pass is legal,
  hand scores and the match winner all come from the engine and the server's own state.
- Privacy: `dominoes:room` goes to everyone in the room and carries only public state (board, open
  ends, hand sizes, the unused count, scores, turn, last action). It never contains a hand, the
  unused tiles, the tile that must open, or anyone's browser key, socket id or account id.
  `dominoes:private` goes to one socket only and carries that player's hand, their legal moves and
  whether they may pass. When a hand ends, its result (in `match.results` and `outcome.results`)
  reveals every hand as it stood at the end, for the score breakdown.
- Reconnecting: a disconnected player keeps their seat and hand. The room view marks them
  disconnected with `graceEndsAt`. Rejoining before then (`dominoes:rejoin`) restores everything,
  mid-match included. Seats are never reordered and nobody is removed mid-hand while the grace runs.
- Grace period: `ROOM_GRACE_DOMINOES_MS` while a match is being played (default 3 minutes),
  `ROOM_GRACE_LOBBY_MS` otherwise (default 5 minutes). When it ends, the seat is freed. If a tile has
  been played in the match, the match is forfeited for that player's side (the other side wins and
  the result is recorded); before that, the room just goes back to the lobby and nothing is recorded.
  Leaving a started match (`dominoes:leave`) works the same way.
- No turn timer and no automatic pass: a slow or absent player is never passed for, because an
  automatic pass could be an illegal one (they may hold a tile that fits). Only the grace period
  above ends a stalled match.
- After a match (finished or forfeited), `dominoes:rematch` returns the room to the lobby with the
  same seats and readiness cleared.
- A code that belongs to another game answers `WRONG_GAME` with `params.gameType`. Joda Casino
  answers the same for Dominoes codes, and Joda Memory answers `{ success: false, error: 'Wrong game',
  gameType }`.
- Invitations: a seated player in a lobby can invite available players into its free seats
  (`invite:send` with `game: 'dominoes'`), exactly like Joda Casino.

## Deployment assumption

Rooms live in the memory of one backend process. Redis (when `REDIS_URL` is set) is a write-through
copy so rooms survive a restart; it is not used for coordination between processes. Run exactly one
backend instance. Several instances would each own their own copy of a room and diverge. After a
restart every player is shown as disconnected until they rejoin, and the grace period starts again.
A stored match is checked by the engine (`restoreMatch`) when it is loaded; one that fails its tile
accounting is dropped and the room goes back to the lobby.

## Results

A finished or forfeited match is written once, in one statement keyed by the match id, into the
tables Joda Casino already uses, so no migration is needed:

- `games`: `game_type = 'dominoes'`, settings
  `{ mode, players, targetScore, rulesVersion, winnerTeam, scores, hands, forfeit?, forfeitTeam? }`;
- `game_participants`: one row per seat with its team (seat % 2 with four players, the seat with
  two), `win`/`loss` and that side's final score;
- `game_hands`: one row per hand with `dealer_seat` = the seat that started the hand, both sides'
  points and `breakdown = { ending, outSeat, pips, teamPips, winnerTeam, points }`.

A match abandoned before any tile was played records nothing. A finished match waits in the room's
saved `pendingResults` until it is written; it is retried a few times, again at every restart, and
survives a rematch. Retries and restarts can't duplicate it.
