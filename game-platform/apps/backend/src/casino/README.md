# Joda Casino (`african-casino`)

Swazi Casino as described by pagat.com ("African Casino", Swazi section), for two players
head to head or four players in two partnerships. The gamerules.com overview was read too;
where it differs (it says the owner of a build is "whoever most recently added to it"),
the detailed Swazi rules win: the owner is whoever made the build or last changed its value.

The South African 40-card variant, the Sotho variant and three-player games are not implemented.

## Rules the engine enforces

Cards and values
- Standard 52-card deck, no jokers. Card ids are stable: `AS`, `10D`, `QH`, ...
- 2–10 face value, J 11, Q 12, K 13, A 1 or 14. A loose ace or an ace played from hand is 1 or 14
  at the player's choice; once in a build its value is fixed until the build is captured.
  An ace can only be 14 on its own (any sum containing a 14 would exceed 14), so inside a
  multi-card sum an ace is always 1.

Seats, deal and turn order
- Seats are numbered in anticlockwise order. Play passes to the next seat number, which is the
  seat on the previous player's right.
- Four players: opposite seats are partners (seats 0+2 against 1+3). Two players: one per side.
- The first dealer is random. The player on the dealer's right (dealer + 1) cuts four cards from
  the middle of the shuffled deck face up as the layout and plays first; the dealer plays last.
  After each hand the deal passes to the right (dealer + 1).
- House choice: everyone is dealt 4 cards at a time. When every hand is empty, 4 more each go onto
  the same table from the rest of the deck, until it is used up: three deals with four players, six
  with two. (The source deals 12 each, or 12 and then 12 more with two players; the cards played are
  the same, only the hands are smaller.)
- House choice (the source "suggests" it): if the four layout cards are worth 3 or more points
  (10♦ = 2, 2♠ = 1, each ace = 1) or include three or more picture cards, they are shuffled back
  and the cut is repeated. Off by default since card-count scoring (`redealStrongLayout`), because
  those cards no longer score.

A turn
- A turn is an ordered list of actions and plays exactly one card from hand.
- Hand actions (exactly one per turn): capture, discard, create a single build with a hand card,
  add a hand card to a build, change the value of an opponent's single build.
- Free actions (any number, before or after the hand action): create a single build from loose
  cards only; add a set of loose cards and/or the exposed top of the opponents' capture pile to a
  build, or to a loose card that becomes the base of a new augmented build.
- Every action is checked against the position the previous action left. The final position is
  checked too. A rejected turn changes nothing.

Capturing
- The played card captures loose cards of its value, sets of loose cards adding up to its value,
  and the build of its value. Builds are only captured by matching their value exactly; they can't
  be added to anything to make a capture.
- Cards can never be captured straight off a capture pile.
- Captures go face up on the capturing side's single pile (partners share one). The player orders
  the captured cards; the capturing card goes on top. Only the top card of a pile is shown to the
  other side; the order underneath stays private to the side that owns the pile.
- Whoever captured last takes the cards left on the table at the end of the hand.

Builds
- A single build is one set of cards adding up to its value (at least two cards). An augmented
  build is two or more sets with the same value. Values run 1–14.
- Each build has an owner. Only one build of a given value can be on the table. A build can't be
  split, and two builds can't be combined into a higher value.
- Creating a single build: from loose cards only, or (house rule) one hand card with exactly one
  loose card; a hand card with two or more loose cards is refused (`BUILD_ONE_TABLE_CARD`). No build
  is ever worth more than 14 (`VALUE_TOO_HIGH`). The builder must keep a card that captures it. Capture-pile cards can't be used. If your side already owns a build of
  that value, add the set to it instead (the engine asks you to).
- Joda Fun rule: a build left on the table at the end of a turn needs a card from the builder's
  hand. A new build made only from loose or pile cards (a single build from loose cards, a new
  augmented build on a loose base, a "take from pile" onto a loose card) must be captured in the
  same turn, unless a hand card is added to it in that turn (`BUILD_NEEDS_HAND_CARD`).
- Changing a value: only an opponent's single build, only by adding one hand card, and only if you
  keep a card matching the new value. You become the owner. Augmented builds never change value.
  If the new value is one your side already owns, the two become one augmented build.
- Augmenting: your side's builds, or an opponent's build that you then capture in the same turn
  (with layout and pile cards only, since your hand card is needed for the capture). A loose card
  you can capture (and that matches no build) can become the base of a new augmented build.
- The exposed top card of the opponents' capture pile may be used only inside an augmenting set,
  one card per set; taking it exposes the next card. Your own side's pile is never usable.
- House choice for online play: a submitted turn may use only the pile card that was showing when
  the turn started. To go deeper, "take from pile" first: it adds the showing card to one of your
  side's builds (or to a loose card you can capture, starting your own build) at once, and everyone
  sees the card underneath before you choose the rest of the turn. This keeps the hidden order of a
  pile hidden: a preview or a rejected turn can never tell you what an unseen card is.
- Owners must keep a card that captures each build they own (with two aces needed for builds of
  1 and 14 at the same time). You can't use your last such card for anything else.

Two-player game, first 12 cards each (the first three deals of 4)
- You can't discard without capturing while you own a build.
- You may own at most one build at the end of your turn.

Partnerships
- When your partner's build is captured by anyone other than your partner, or its value is changed
  by an opponent, your partner is known to hold that rank until they next play a card of it.
  While that is known you may create a build of that value for your partner (your partner owns it),
  or use such a loose card as a base.
- "Please don't capture": a player holding a card of a value their side owns can say so (the server
  checks their hand; everyone sees the request). Their partner may then add their played card to
  that build instead of capturing it and hand ownership to the requester. The request lapses when
  the requester plays a card of that rank, the build leaves the table or the hand ends.

## House policy for omissions

The rules let an opponent insist that you (a) take everything your played card is entitled to
capture when you capture or discard with it, and (b) add to your side's builds any loose cards or
exposed pile card that legally could be added before you end your turn. Online, there is nobody to
ask, so:

- A capture or discard with omission (a) is rejected, and the message names the cards that must be completed.
- (a) is judged at the moment the card is played: after your capture, no remaining loose card or set
  of loose cards may add up to the played value and no build of that value may be left. A discard is
  rejected if the card could have captured something. Building or augmenting with the card instead
  ("drifting") is always allowed.
- (b) is not enforced (Joda Fun rule): cards that could join your side's builds may stay on the
  table, where anyone can use them later.
- When different completions are possible (for example three loose 5s and a played 10), any one of
  them is accepted: the player chooses.
- Nobody should ever be stuck: `legalTurns` builds legal turns from any position, and 300 simulated
  matches (about 50,000 turns, both modes) never found a position without one. If one ever occurs,
  the server accepts a plain discard and logs it.

## Scoring and match

House choice (Joda Fun): only the number of cards counts. After each hand only the side with more
cards scores, by how many it took: 27–32 → 1, 33–35 → 2, 36–38 → 3, 39–41 → 4, 42–45 → 5,
46–48 → 6, 49–51 → 7, all 52 → 8. 26 each scores nothing. Spades, 2♠, 10♦ and aces earn nothing
(the Swazi source scores 11 points a hand from those items). Hands scored before this change keep
their old breakdown fields in `results` and in `game_hands.breakdown`.

A match is played to a target (7 by default, a room setting between 3 and 31). Victory is checked
only after a completed hand: the side with the most points wins once it has reached the target.
If the leaders are tied at or above the target, another hand is played.

## Multiplayer

- Every action names the state version it was made against and a unique request id. Stale versions
  are rejected; a repeated request id gets the original answer and is never applied twice. Each
  room's mutations run one at a time.
- The server seats each newcomer in the lowest free seat; in the lobby a player may move to another
  free seat, which also chooses their team. A player must have a session (a guest account is fine),
  and an account holds at most one seat per room. Reclaiming a seat after a refresh or reconnect
  requires the same signed-in account and the same browser key; another device of the same account
  can't take the seat over. Neither the browser key nor the deck is ever sent to other players.
- A capture whose pile order the player didn't arrange gets a random order, so the cards under the
  top can't be predicted from the public layout.
- Everyone receives the public state (layout, builds, pile tops and sizes, hand sizes, scores).
  Each player privately receives their hand and their own side's pile order.
- Leaving a started match, or staying away past the grace period, forfeits it for that side.

## Deployment assumption

Rooms live in the memory of one backend process. Redis (when `REDIS_URL` is set) is a write-through
copy so rooms survive a restart; it is not used for coordination between processes. Run exactly one
backend instance. Several instances would each own their own copy of a room and diverge.

Results are written in one statement keyed by the match id, so retries and restarts can't
duplicate them. A finished match waits in the room's saved `pendingResults` until it is written; it
is retried a few times, again at every restart, and survives a rematch. The migration `add_casino_results` must be applied (`npx prisma migrate deploy`,
which the Railway start command already runs).
