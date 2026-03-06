# Solver Correctness Fixes

Bugs discovered and fixed during post-launch UI testing (Phase 2). All three bugs
manifested as wrong solver predictions in the live app: opening predicted Draw, but
subsequent turns showed Win for all opponent moves.

---

## Bug 1: buildCardIndex Missing Board Cards (NaN Hash)

**Problem:** `buildCardIndex` only scanned the remaining hands when called mid-game.
Cards already placed on the board were absent from the index. When `hashState` encoded
those board cells it computed `undefined * 2 - 1 = NaN`, collapsing every state with
any pre-placed card to the same TT key. Every TT lookup returned a stale hit for an
unrelated state — corrupting the entire search from turn 2 onward.

**Fix:** `buildCardIndex` now also iterates over `state.board`, indexing any card
already placed on the board. All 10 cards are indexed regardless of where they are at
the time `findBestMove` is called.

**Why this works for `createSolver`:** The persistent solver calls `reset()` once with
the full initial hands, so all 10 cards are indexed from the start and never leave the
index as they move to the board. `findBestMove` (fresh TT per call) now builds the same
complete index by also scanning the board.

---

## Bug 2: Turn Bit Collision with Cell-0 Encoding

**Problem:** `hashState` started `shift = 1`, meaning the turn bit (0 for Player, 1 for
Opponent) and cell-0's card encoding (values 1–20) occupied the same digit position.
Specifically:

```
(Player turn, Opponent-owned card with index k at pos 0) = 0 + 2k = 2k
(Opponent turn, Player-owned card with index k at pos 0) = 1 + (2k-1) = 2k
```

These two distinct game states produced identical hashes. The collision was triggered
whenever a card at position 0 was captured: both the card's owner and the current turn
flip simultaneously, mapping the before- and after-capture states to the same TT key.

**Fix:** Changed `shift = 2` so the turn bit occupies bit 0 alone (even/odd), and cell
encodings pack from bit 1 upward. Cell-0 values (2, 4, 6, …, 40) are all even and
cannot alias the turn bit (0 or 1). Total hash width is unchanged at 46 bits (well
within safe-integer range).

---

## Bug 3: evaluatingFor Not Normalized (Persistent TT Corruption)

**Problem:** `findBestMoveWith` passed `state.currentTurn` as `evaluatingFor` to
`minimax`. TT values encode "goodness for evaluatingFor" — but `hashState` does not
include `evaluatingFor` in the key. As a result:

- Turn 1 (Player's turn): TT entries stored as "+1 = Player wins".
- Turn 2 (Opponent's turn): same TT entries read as "+1 = Opponent wins".

The sign meaning flipped between turns, producing completely wrong predictions. In the
UI this showed as all-Win suggestions for the opponent immediately after a Draw-predicted
opening move.

**Fix:** `findBestMoveWith` now always passes `Owner.Player` as `evaluatingFor` to all
`minimax` calls. TT values are permanently "from Player's perspective." The result is
interpreted at the output layer:

```typescript
const effectiveValue = currentIsPlayer ? value : -value;
const outcome = effectiveValue === 1 ? Outcome.Win : effectiveValue === -1 ? Outcome.Loss : Outcome.Draw;
```

The robustness comparison is similarly flipped for Opponent's turn:

```typescript
if (currentIsPlayer ? responseValue > value : responseValue < value) betterOutcomeCount++;
```

This makes TT entries safe to reuse across all turns regardless of who is to move.

---

## Alpha-Beta TT Bound Limitation: Non-Best-Move Predictions

**Discovery:** During test authoring we found that Loss predictions for non-optimal
moves are not always exact when using the persistent TT.

**Root cause:** Alpha-beta stores `UpperBound` and `LowerBound` entries for states that
were pruned in a specific alpha-beta window. When a different call queries the same state
with a wider window, an `UpperBound(0)` entry (meaning "true value ≤ 0") reached via
`cached.value(0) <= alpha(0)` will short-circuit to `0` even if the true value is `-1`.
This only affects moves that were pruned during a previous call — the optimal move's
subtree is always fully explored and gives exact values.

**Impact:** Best-move predictions are always correct (the optimal path is fully
explored). Outcome labels for non-optimal moves may be over-pessimistic or
over-optimistic. In the app, users follow the best move, so this is acceptable.

**Test strategy:** Tests that verify non-best-move predictions (e.g., "Loss move
actually loses") use `findBestMove` (fresh TT per call) rather than `solver.solve`
(persistent TT). Fresh TT gives exact values at each root because each move is evaluated
with a full `(-∞, +∞)` window before the TT accumulates cross-branch bounds.

---

## Self-Play Consistency Tests

**Decision:** Added a `solver self-play consistency` describe block with six tests:

1. **Self-play from opening (basic)** — 2-unique-card hands; opening prediction matches
   actual self-play outcome.
2. **Turn N+1 consistency (basic)** — after optimal first move, turn-2 prediction is
   the mirror of the opening prediction.
3. **Self-play from opening with Plus rule** — varied stats, Plus rule; opening
   prediction matches full self-play.
4. **Identical hands with Plus rule** — the card set reported by Yshan (8-8-4-1 etc.);
   cross-turn prediction consistency.
5. **Turn N+1 consistency (10-distinct-card game)** — full performance-test card set;
   catches NaN-hash regressions on large trees.
6. **Self-play from mid-game position** — 5 cards pre-placed before the first
   `findBestMove` call; directly exercises the board-cell indexing fix.

**Cross-turn TT consistency test** (in `createSolver — TT persistence`): confirms that
`solver.solve()` on turn 2 correctly mirrors the turn-1 prediction, catching the
evaluatingFor bug.

**Loss prediction accuracy test** (in `createSolver — Loss prediction accuracy`):
confirms that a Loss-predicted move (found via `findBestMove` with fresh TT) actually
loses when both sides play optimally thereafter (verified via `selfPlayExact`, also using
fresh TT per call). Uses the card set reported by Yshan: 8-2-3-8 / 4-8-8-1 / 8-8-4-1 /
A-A-2-5 / 2-5-9-9, both sides identical, Plus rule.
