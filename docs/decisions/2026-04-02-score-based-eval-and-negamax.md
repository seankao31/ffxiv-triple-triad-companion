# Score-Based Evaluation & Negamax Refactor

Two sequential refactors to the Rust solver, completed 2026-04-02. Both are
behavior-preserving — no test changes required (only test construction syntax updated).

---

## Part 1: Score-Based Evaluation

**Problem:** `RankedMove` carried an `Outcome` enum (`Win`, `Draw`, `Loss`) alongside
a `score: u8` field. The outcome was redundant — it's fully derivable from the score
(`>5` = win, `=5` = draw, `<5` = loss). The enum added a separate code path in
`find_best_move_with` that had to stay in sync with the score, and its presence in the
public API forced consumers (UI, WASM bindings, fixtures) to carry both representations.

**Decision:** Remove `Outcome` entirely. `RankedMove` keeps only `score: u8` (the
player-to-move's raw score, 1–9). All outcome-tier logic uses the score directly.

**Changes:**
- Rust: removed `Outcome` enum from `types.rs`, updated `solver.rs` to derive outcome
  tiers from score, updated WASM bindings and server serialization
- TypeScript: removed `Outcome` enum from `types.ts`, updated UI components to derive
  display text from score
- Fixtures: solver fixtures updated from `outcome` field to `score` field
- Tests: construction syntax updated (`outcome: Outcome::Win` → `score: 7`, etc.)

**Why not keep both?** The dual representation is a classic consistency bug waiting to
happen. Every place that constructs a `RankedMove` must compute both values identically.
The score is the ground truth; the outcome is a view of it.

---

## Part 2: Negamax Refactor

**Problem:** The minimax implementation used explicit `is_maximizing` branching and an
`evaluating_for: Owner` parameter threaded through every recursive call. This created:
- Dual TTFlag logic (one branch for maximizing, one for minimizing)
- A `current_is_player` conditional in `find_best_move_with` for score sign-flipping
  and robustness tier comparison
- A perspective-pinning invariant (`evaluating_for` always `Owner::Player`) that was
  non-obvious and existed solely to make TT values reusable across turns

**Decision:** Replace minimax with negamax. Negamax always maximizes from the current
mover's perspective, eliminating the maximizing/minimizing duality.

**Key changes in `solver.rs`:**
- `terminal_value(state)` — no longer takes `evaluating_for`; uses `state.current_turn`
  to return the mover's score minus 5
- `negamax(state, alpha, beta, tt, occupied)` — no `evaluating_for` parameter; recursive
  call negates and swaps bounds: `-negamax(state, -beta, -alpha, tt, occupied)`
- Single TTFlag path — always maximizing, so `orig_alpha` comparison suffices
- `NEG_INF`/`POS_INF` constants (-10/+10) replace `i32::MIN`/`i32::MAX` to avoid
  overflow on negation (`-i32::MIN` panics in debug Rust)
- `find_best_move_with` — first pass negates (1 ply = opponent's perspective), robustness
  pass does not negate (2 plies = back to root mover's perspective), score conversion is
  direct `(value + 5) as u8` with no conditional sign flip

**TT compatibility:** The old minimax pinned `evaluating_for = Owner::Player` so all TT
values shared the same perspective. Negamax stores values from the mover's perspective
instead. This is safe because `hash_state` encodes `current_turn` in bit 0, so
Player-to-move and Opponent-to-move entries get different hash keys. The persistent
`Solver` struct's TT reuse across turns remains correct.

**Net effect:** -11 lines, removed `evaluating_for`, `is_maximizing`, `orig_beta`,
`current_is_player`, the dual TTFlag branches, and the conditional sign flip. All 93
Rust tests, 11 WASM tests, and 167 UI tests pass unchanged.

---

## Why Two Separate Refactors

Score-based evaluation was a prerequisite for negamax. The old `Outcome` enum encoded
win/draw/loss as a discrete type, but negamax needs a continuous signed value that can
be negated. With `score: u8` as the single representation, the `terminal_value` →
negation → score conversion pipeline is clean. Attempting both refactors simultaneously
would have been harder to verify since each changed the value flow through the solver.
