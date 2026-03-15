# Engine Implementation Decisions

Decisions made during implementation and code review of the Triple Triad engine (v1).

---

## TT/Alpha-Beta: Store Bounds, Not Exact Values

**Decision:** The transposition table stores `(value, flag)` where `flag ∈ { Exact, LowerBound, UpperBound }`.

**Rejected:** Storing exact values regardless of pruning context.

**Why:** Alpha-beta pruning returns cutoff values that may not be the true minimax value. If a node's best value is `≥ beta`, the search cuts off early — the returned value is a lower bound, not exact. Storing it as exact would cause future lookups to return incorrect values, leading to wrong move rankings.

The correct protocol:
- `bestValue ≤ origAlpha` → `UpperBound` (search was failing, real value may be lower)
- `bestValue ≥ beta` → `LowerBound` (search was cut off, real value may be higher)
- Otherwise → `Exact`

On lookup, `LowerBound` and `UpperBound` entries narrow the alpha-beta window rather than returning directly.

**Trade-off:** Correctness cost ~3× search time vs naïve exact caching (~11s → ~35s from turn 1). Accepted — this is a TypeScript prototype, correctness matters more than raw speed.

---

## Robustness: Fraction of Opponent Responses That Are Mistakes

**Decision:** `robustness = betterOutcomeCount / totalResponses` — the fraction of the opponent's possible responses that lead to a *strictly better* outcome for us than the minimax value predicts.

**Rejected (first attempt):** `sameOutcomeCount / totalResponses` — fraction of responses that maintain the minimax outcome. This is backwards for non-winning moves:
- For **win** moves: all responses maintain Win (robustness = 1), useless for tie-breaking.
- For **draw** moves: lower sameOutcomeCount means more responses give us a Win (better!) — but the metric ranked those moves *lower*.
- For **loss** moves: same issue, wrong direction.

**Rejected:** "Fraction of responses the opponent loses." Ambiguous and only meaningful for winning positions.

**Why `betterOutcomeCount` is correct:** The original intent was "prefer moves that expose the opponent to a greater chance of making a mistake." A mistake is any response that leads to a strictly better outcome for us than minimax predicts.

- Win moves: `betterOutcomeCount = 0` always (nothing beats a win). No differentiation among wins — which is correct; all winning moves are game-theoretically equivalent.
- Draw moves: counts responses where we win despite the position being drawn. Higher = more opponent escape routes that actually benefit us.
- Loss moves: counts responses where we draw or win despite the position being lost. Higher = more chances for opponent to hand us an escape.

**Example:** After our move, opponent can play R1 or R2. If R1 leads to us winning and R2 leads to a draw, minimax = Draw (min = 0), robustness = 1/2. We prefer this over a move where both responses stay as draws (robustness = 0).

---

## Card Deduplication: Outer Loop Only

**Decision:** `findBestMove` deduplicates cards by signature in its outer evaluation loop. The inner `minimax` function does not deduplicate.

**Reasoning:** In practice, a player's hand contains unique cards (different stats). Deduplication in `minimax` would add overhead to the hot path for zero benefit in typical games.

The outer loop deduplication prevents `findBestMove` from returning duplicate `RankedMove` entries when a hand contains identical cards — which can happen in synthetic test cases.

---

## Two-Pass Structure for findBestMove

**Decision:** `findBestMove` runs minimax on all moves first, then calculates robustness in a second pass.

**Why not one pass:** Robustness requires evaluating the opponent's responses after each candidate move. Running these evaluations after the first pass means the transposition table is already fully populated, so the robustness calculations are essentially free cache lookups. There's no meaningful difference vs one pass.

---

## RuleSet Stored on GameState

**Decision:** `GameState` carries a `rules: RuleSet` field (`{ plus: boolean, same: boolean }`). `createInitialState` accepts an optional `rules` parameter defaulting to `{ plus: false, same: false }`.

**Rejected:** Passing RuleSet as a parameter to `placeCard`.

**Why:** RuleSet is a property of the game, not of individual moves. Storing it on GameState ensures capture logic is consistent across all turns without callers tracking it. It also simplifies the solver — `placeCard` is called recursively with `nextState`, and the rules propagate automatically.

---

## TypeScript: noUncheckedIndexedAccess with Non-Null Assertions

**Decision:** Enable `noUncheckedIndexedAccess` in tsconfig and use `!` non-null assertions where array indices are validated by context.

**Rejected:** Runtime bounds checks everywhere; disabling the flag.

**Why:** `noUncheckedIndexedAccess` catches a real class of bugs at compile time. For inner-loop array accesses that are structurally guaranteed (e.g., `ADJACENCY[position]` where `position` is 0-8, `hand[ci]` inside a `hand.length` loop), `!` assertions are the right tool — they communicate intent without runtime overhead. Adding actual `if` guards in hot-path code would be noise.

---

## Terminal State: Board Full OR Hand Empty

**Decision:** The minimax terminal condition is `board.every(c => c !== null) || hand.length === 0`.

**Rejected:** Checking only `hand.length === 0`.

**Why:** In a standard 5v5 game, one player places 5 cards and the other places 4 (since player goes first). At turn 9, the board fills while the second player's hand still has 1 card. Checking only hand length would miss this terminal condition and cause the search to recurse into a state with no legal moves, producing incorrect results.

---

## Transposition Table: Adaptive Size Cap for V8 Compatibility

**Decision:** `createSolver` accepts an optional `maxTTSize` parameter (default `Infinity`). Internally, a `discoveredLimit` mutable variable starts at `maxTTSize` and is narrowed to `tt.size` if a `RangeError` is ever caught from `tt.set()`. All TT insertions go through a `ttInsert` closure that fast-paths out once the limit is known.

**Why adaptive instead of a hardcoded constant:** V8 (Chrome/browser) enforces a hard `Map` size limit of `2^24 = 16,777,216` entries. A fixed constant would leave performance on the table in engines with higher limits (e.g., future V8 versions, JSC). The try-catch fires exactly once per Map lifetime; subsequent inserts skip via the fast `tt.size >= discoveredLimit` check with no exception overhead.

**Testing gap:** Tests run in Bun (JavaScriptCore), which has no Map size limit. We cannot write a test that uses a real Map and observes the V8 crash. The `maxTTSize` parameter exists to let tests inject an artificial limit and verify graceful degradation. This gap means V8-specific Map behaviour is only validated manually (by observing the browser console). This is a known limitation of the current single-engine test setup.
