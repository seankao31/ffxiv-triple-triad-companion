# Scoring and Sorting Analysis

Analysis of how move scoring and sort order are tested across the Rust solver,
WASM boundary, and UI layers. Includes mutation-style edge case probing.

---

## Architecture Overview

`find_best_move` in `engine-rs/src/solver.rs` returns a `Vec<RankedMove>` sorted
by a three-level comparator:

1. **Primary — outcome tier:** wins (score > 5) before draws (= 5) before losses (< 5)
2. **Secondary — robustness:** higher first (fraction of opponent responses that
   lead to a strictly better outcome tier for us)
3. **Tertiary — raw score:** higher first (prefer 7-card win over 6-card win)

Two consumers depend on this sort order being correct:

- **`wasm_simulate`** (`lib.rs:63`) takes `moves.into_iter().next()` — the first
  element — as the "top move" for PIMC tallying. A broken sort means every PIMC
  simulation votes for the wrong move.
- **`SolverPanel.svelte`** (`line 39`) filters `rankedMoves` to `bestTier` by
  taking the first move's tier. A broken sort shows the wrong outcome group.

PIMC results (Three Open) use a separate sort: confidence-only descending
(`pimc.rs:185`, `store.ts:125`).

---

## Test Coverage by Layer

### Layer 1: Sort Comparator (Rust unit tests, `solver.rs`)

| Test | Sort level exercised | Assertion style |
|------|---------------------|-----------------|
| `ranks_winning_above_drawing_above_losing` (437) | Primary (tier) | Non-decreasing tier invariant across 12 moves |
| `prefers_draw_move_with_more_opponent_mistakes` (466) | Secondary (robustness) | Exact position ordering: pos 7 before pos 8 |
| `prefers_moves_with_higher_robustness` (502) | Secondary (robustness) | All winning moves have robustness = 0.0 |
| `returns_ranked_moves_when_all_outcomes_are_losses` (530) | Secondary (robustness) | Robustness non-increasing across loss moves |
| `robustness_nonzero_when_opponent_can_blunder` (562) | Secondary (robustness) | Exact values: 0.5 for positions 6/8, 0.0 for position 7 |

### Layer 2: Score Correctness (Rust unit tests, `solver.rs`)

| Test | What it verifies |
|------|-----------------|
| `terminal_value_returns_score_differential` (377) | Single move → score > 5 (win) |
| `finds_only_winning_move_in_late_game` (409) | Correct card ID and position for the sole winning move |
| `evaluates_from_current_players_perspective_when_opponent_goes_first` (519) | Opponent-first: all moves score > 5 from mover's perspective |

### Layer 3: Cross-Engine Fixtures (shared JSON, `tests/fixtures/solver/`)

Three fixtures consumed by both Rust (`solver_fixtures.rs`) and WASM (`solver.wasm.test.ts`):

| Fixture | Tier mix | Sort levels exercised |
|---------|----------|----------------------|
| `solver_late_game_win` | 1 win | None (single move) |
| `solver_opponent_first` | 9 wins (scores 8 and 9) | Tertiary: score-9 wins before score-8 wins |
| `solver_full_board` | Empty (0 moves) | None |

### Layer 4: PIMC Confidence Sort

**Rust (`pimc.rs`):** `run_pimc_returns_ranked_moves_with_confidence` and
`run_pimc_confidence_sums_to_at_most_one` verify confidence is present and valid.
Neither checks sort order.

**TypeScript (`store.test.ts`):** `sets rankedMoves and clears loading when all
50 results arrive` checks `confidence > 0 && <= 1` for the first move. Does not
verify confidence-descending order.

### Layer 5: UI (SolverPanel)

All SolverPanel tests construct manually-sorted `rankedMoves` arrays. No test
exercises the component with misordered input to verify it handles or rejects it.

---

## Edge Cases Probed

### Confirmed caught

**Tier direction flip** (`tier(a).cmp(tier(b))` → reversed): Caught by
`ranks_winning_above_drawing_above_losing` — losses would appear first, violating
the non-decreasing invariant.

**Robustness direction flip** (`b.robustness` → `a.robustness`): Caught by both
`returns_ranked_moves_when_all_outcomes_are_losses` (asserts non-increasing) and
`robustness_nonzero_when_opponent_can_blunder` (asserts first move has robustness 0.5).

**Tertiary key removal** (`b.score.cmp(&a.score)` deleted): Caught by the
`solver_opponent_first` fixture — score-9 and score-8 wins both have robustness 0,
so without tertiary sort they'd stay in position order (0,1,2,...). Fixture expects
corners/center (9) before edges (8).

**Score offset** (`value + 5` → `value + 4`): Caught by `solver_late_game_win`
fixture — expects exact score 6, mutation shifts to 5.

**Tier threshold `> 5` → `>= 5` in sort comparator (line 273):** Tested by
mutating to `>= 5` — draws become tier 0 alongside wins. The mutation WAS caught,
but only because the robustness tiebreaker (draws have robustness 0.333, wins have
0.0) pushed draws above wins, making the test's tier check see a decrease.
**Fragile:** in a game position where wins and draws have equal robustness, this
mutation would survive the non-decreasing invariant.

### Survivors

**Robustness tier threshold `v > 0` → `v >= 0` (line 249):** Classifies draws as
wins for robustness purposes. All solver tests pass (74 tests, plus all fixtures).
Draws get robustness 0 instead of their correct value, but no test checks the
exact robustness of a draw move.

**Impact:** A draw move that should show "33% of opponent responses improve our
outcome" displays "0%" instead. The user sees no robustness differentiation
between draws with different opponent-blunder potential.

---

## Untested Behaviors

### 1. `wasm_simulate` top-move correctness

`wasm_simulate` returns `moves.into_iter().next()` — the first element after
sorting. The only WASM test checks `expect(move).not.toBeNull()`. If the sort
were broken or removed, `wasm_simulate` would return an arbitrary move, and
every PIMC simulation would vote for the wrong move. No test catches this.

**Risk:** High — PIMC correctness depends entirely on the sort being correct
inside `wasm_simulate`, but this is only tested indirectly through `wasm_solve`
fixture tests.

### 2. TS-side PIMC confidence sort order

`store.ts:125` sorts PIMC results by confidence descending. The store test
checks `confidence > 0 && <= 1` for `rankedMoves[0]` but never verifies that
multiple moves are sorted by confidence. If the sort were removed or reversed,
no test would fail.

**Risk:** Medium — the UI shows best-tier moves to the user; a misordered list
would highlight the wrong move.

### 3. Tertiary sort key for losses

No test exercises score ordering among equal-robustness losses. The
`returns_ranked_moves_when_all_outcomes_are_losses` test has 3 loss moves with
varying robustness (so the secondary key separates them). The
`solver_opponent_first` fixture exercises the tertiary key for wins. A mutation
that removes the tertiary key only for score < 5 would survive.

**Risk:** Low — within the same loss tier, score difference (e.g., losing 3-7
vs 4-6) is cosmetic; the player loses either way. But it could confuse users who
interpret higher-ranked losses as less severe.

### 4. PIMC first-seen score semantics

When PIMC tallies by `(card_id, position)`, the score and robustness fields come
from whichever simulation *first* recommended that move. Different simulations
sample different opponent cards, yielding different scores. The score on a PIMC
result is from an arbitrary sampled world, not an aggregate.

**Risk:** Low for correctness (only confidence matters for ranking). But the
SolverPanel displays the tier label from `rankedMoves[0].score`, which means the
displayed "Win" / "Draw" / "Loss" could come from a non-representative simulation.

### 5. Score range bounds

The domain guarantees scores are in [1, 9] (you always own at least 1 card and
at most 9), but no test asserts this invariant. The `value + 5` conversion
(`solver.rs:259`) could produce 0 if negamax returned -5 (impossible in the
current domain, but undocumented as a precondition).

**Risk:** Very low — the domain constraint is structural (you place the last card,
so you always own at least 1).

### 6. SolverPanel assumes pre-sorted input

`bestTierMoves` (`SolverPanel.svelte:39`) takes the first move's tier and filters
to that tier. This is correct only if `rankedMoves` is sorted by tier. All
SolverPanel tests construct manually-sorted input, so a broken solver sort would
not be caught at the UI level.

**Risk:** Low — the solver sort is well-tested at the Rust level. But the UI has
no defensive assertion, so a future refactor that breaks the sort contract would
silently show wrong results.

---

## Recommendations

1. **Fix the robustness tier survivor** — add a test with a draw position where
   the opponent can blunder into a win, verifying that draw moves have non-zero
   robustness. This catches `v > 0` → `v >= 0`.

2. **Add a `wasm_simulate` correctness test** — compare `wasm_simulate` output
   against `wasm_solve()[0]` for a fixture state. This verifies the sort-then-take-first
   pipeline works end-to-end through the WASM boundary.

3. **Add PIMC confidence sort assertion** — in the store test that completes all
   50 sim-results, send results with varying positions so multiple entries have
   different confidence values, then assert `rankedMoves[i].confidence >=
   rankedMoves[i+1].confidence`.

4. **Strengthen the tier ordering test** — in `ranks_winning_above_drawing_above_losing`,
   additionally assert that the first draw appears strictly after the last win:
   `assert!(tier(moves[win_count].score) > tier(moves[win_count - 1].score))`.
   This directly tests tier separation rather than relying on the non-decreasing
   invariant, which can be satisfied by accidental robustness differences.
