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

## Robustness: Fraction of Opponent Responses That Maintain Outcome

**Decision:** `robustness = sameOutcomeCount / totalResponses` — the fraction of the opponent's possible responses that leave the outcome unchanged.

**Rejected:** "Fraction of responses the opponent loses." That formulation is only meaningful for winning moves. The chosen formulation is symmetric — it applies equally to win, draw, and loss outcomes.

**Example:** If your move wins no matter what the opponent plays, robustness = 1.0. If the opponent has one escape response, robustness = (N-1)/N.

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
