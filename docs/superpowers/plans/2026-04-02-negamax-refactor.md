# Negamax Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Rust solver from minimax with explicit max/min branching to negamax, eliminating the `evaluating_for` parameter, dual TTFlag logic, and perspective-flipping code.

**Architecture:** Negamax always maximizes from the current mover's perspective. Terminal values return `mover_score - 5` (already the case after Plan 1). The recursive call negates: `value = -negamax(-beta, -alpha, ...)`. TT values are stored from the mover's perspective — safe because `hash_state` includes `current_turn`, so entries are segregated by whose turn it is. `find_best_move_with` converts negamax values (mover-relative) to raw scores for `RankedMove`.

**Tech Stack:** Rust (engine-rs/src/solver.rs only)

**Prerequisite:** Plan 1 (Score-Based Evaluation) must be completed first. This plan assumes `terminal_value` already returns `mover_score - 5` and `RankedMove` uses `score: u8` instead of `outcome: Outcome`.

**Key simplifications:**
- `evaluating_for` parameter removed — negamax always evaluates from mover's perspective
- `is_maximizing` branch eliminated — always maximizing
- `best_value` always starts at `NEG_INF` — no conditional initialization
- TTFlag determination: single code path instead of dual max/min branches
- Robustness comparison: always tier-based — no `current_is_player` conditional needed (both values from root mover's perspective)
- `effective_value` sign flip in `find_best_move_with` eliminated — negamax returns value from mover's perspective directly
- Alpha-beta bounds use domain constants (`NEG_INF`/`POS_INF`) instead of `i32::MIN`/`i32::MAX` to avoid overflow on negation

**TT compatibility note:** The current minimax stores all TT values from Player's perspective (pinned `evaluating_for = Owner::Player`). Negamax stores values from the mover's perspective instead. Since `hash_state` encodes `current_turn`, Player-to-move entries and Opponent-to-move entries get different hash keys, so there's no conflict. The persistent `Solver` struct's TT reuse across turns remains safe.

---

### Task 1: Refactor minimax → negamax (core function)

**Files:**
- Modify: `engine-rs/src/solver.rs:45-188` (`terminal_value` + `minimax` → `negamax`)

**Context after Plan 1:** `terminal_value(state, evaluating_for)` returns `ef_score - 5` where `ef_score` is `evaluating_for`'s score. `minimax` takes `evaluating_for: Owner` and has `is_maximizing` branching. The function occupies roughly lines 87-188.

- [ ] **Step 1: Update terminal_value to return from mover's perspective**

Currently (after Plan 1):
```rust
fn terminal_value(state: &GameState, evaluating_for: Owner) -> i32 {
    let (player, opponent) = crate::types::get_score(state);
    let ef_score = if evaluating_for == Owner::Player { player } else { opponent };
    ef_score as i32 - 5
}
```

Change to (no `evaluating_for` parameter — always from `current_turn`'s perspective):
```rust
fn terminal_value(state: &GameState) -> i32 {
    let (player, opponent) = crate::types::get_score(state);
    let mover_score = if state.current_turn == Owner::Player { player } else { opponent };
    mover_score as i32 - 5
}
```

Note: At terminal state, `current_turn` is whoever *would* move next (the game has ended). Since turns alternate and the board is full, this is deterministic. For negamax the convention is: terminal value is from the perspective of the player who *would* move, which is `current_turn`.

**Important subtlety:** When the board is full, `current_turn` reflects whoever would move next — which is the player who did NOT make the last move. So `terminal_value` returns the value from that player's perspective. The parent negamax call will negate it (since the parent was the player who DID make the last move). This is exactly correct for negamax.

- [ ] **Step 2: Add alpha-beta bound constants**

Negamax negates alpha/beta in recursive calls (`-beta, -alpha`). Using `i32::MIN`/`i32::MAX` causes overflow on `-i32::MIN` (panics in debug, wraps incorrectly in release). Define domain-appropriate constants instead — actual values are in [-4, +4]:

```rust
const NEG_INF: i32 = -10;
const POS_INF: i32 = 10;
```

Place these near the existing `TT_SIZE` / `EMPTY_KEY` constants.

- [ ] **Step 3: Refactor minimax to negamax**

Replace the entire `minimax` function with `negamax`. Key changes:
- Remove `evaluating_for` parameter
- Remove `is_maximizing` logic — always maximize
- Negate recursive call: `-negamax(state, -beta, -alpha, tt, occupied)`
- Single TTFlag path (always maximizing)
- Use `NEG_INF` instead of `i32::MIN` for `best_value` initialization

```rust
// Returns value from the mover's perspective (positive = good for mover).
// Range: -4 to +4 (score - 5, where score is 1-9).
fn negamax(
    state: &mut GameState,
    mut alpha: i32,
    mut beta: i32,
    tt: &mut Vec<TTSlot>,
    occupied: &mut usize,
) -> i32 {
    let hand_len = if state.current_turn == Owner::Player {
        state.player_hand.len()
    } else {
        state.opponent_hand.len()
    };

    if hand_len == 0 || board_full(state) {
        return terminal_value(state);
    }

    let key = hash_state(state);
    let tt_idx = (key.wrapping_mul(0x9e3779b97f4a7c15) >> (64 - TT_SIZE.trailing_zeros())) as usize;
    let cached_slot = tt[tt_idx];
    let cached = if cached_slot.key == key {
        Some(TTEntry { value: cached_slot.value, flag: cached_slot.flag })
    } else {
        None
    };
    if let Some(entry) = cached {
        match entry.flag {
            TTFlag::Exact => return entry.value,
            TTFlag::LowerBound => {
                if entry.value >= beta { return entry.value; }
                if entry.value > alpha { alpha = entry.value; }
            }
            TTFlag::UpperBound => {
                if entry.value <= alpha { return entry.value; }
                if entry.value < beta { beta = entry.value; }
            }
        }
        if alpha >= beta { return entry.value; }
    }

    let orig_alpha = alpha;
    let mut best_value = NEG_INF;

    let hand_cards: Vec<Card> = if state.current_turn == Owner::Player {
        state.player_hand.clone()
    } else {
        state.opponent_hand.clone()
    };

    let mut seen_cards: HashSet<u32> = HashSet::new();

    'outer: for card in hand_cards.iter() {
        let ck = stats_key(card);
        if !seen_cards.insert(ck) { continue; }

        for i in 0..9usize {
            if state.board[i].is_some() { continue; }

            let undo = place_card_mut(state, *card, i);
            let value = -negamax(state, -beta, -alpha, tt, occupied);
            undo_place(state, undo);

            if value > best_value { best_value = value; }
            if value > alpha { alpha = value; }
            if alpha >= beta { break 'outer; }
        }
    }

    // TTFlag: always maximizing, so standard alpha-beta flag logic.
    let flag = if best_value <= orig_alpha {
        TTFlag::UpperBound
    } else if best_value >= beta {
        TTFlag::LowerBound
    } else {
        TTFlag::Exact
    };

    let incoming_depth = (state.player_hand.len() + state.opponent_hand.len()) as u8;
    if key != EMPTY_KEY {
        let existing = &tt[tt_idx];
        if existing.key == EMPTY_KEY {
            *occupied += 1;
            tt[tt_idx] = TTSlot { key, value: best_value, flag, depth: incoming_depth };
        } else if incoming_depth >= existing.depth {
            tt[tt_idx] = TTSlot { key, value: best_value, flag, depth: incoming_depth };
        }
    }
    best_value
}
```

- [ ] **Step 4: Compile check (expect failure — find_best_move_with not updated yet)**

Run: `cargo check --manifest-path engine-rs/Cargo.toml`
Expected: FAIL — `find_best_move_with` still calls the old `minimax` function. Proceed to Task 2.

---

### Task 2: Update find_best_move_with for negamax

**Files:**
- Modify: `engine-rs/src/solver.rs:190-301` (`find_best_move_with`)

**Context after Plan 1:** `find_best_move_with` currently:
1. First pass: calls `minimax(state, Owner::Player, ...)` for each move → `value` from Player's perspective
2. Second pass: robustness counting with `current_is_player` conditional for comparison direction
3. Converts `value` to `score` via `effective_value` sign flip
4. Sorts by outcome tier → robustness → score

**Negamax value flow:**

`find_best_move_with` is NOT inside the recursive negamax — it's the root caller. All values below are from the root mover's (= `state.current_turn` at entry) perspective.

- **First pass:** After our move, opponent to play. `negamax` returns from opponent's perspective. Negate → root mover's perspective: `value = -negamax(state, MIN, MAX, tt, occupied)`.
- **Robustness pass:** After our move + opponent response, root mover to play (2 plies = back to root mover). `negamax` returns from root mover's perspective directly. **No negation:** `response_value = negamax(state, MIN, MAX, tt, occupied)`. Compare `response_value > value` — strictly greater means opponent blundered.

This works regardless of whether root mover is Player or Opponent. After 2 plies, `current_turn` always returns to root mover.

- [ ] **Step 1: Update first pass**

Replace the first-pass call (currently around line 225):

```rust
// After our move, opponent to play. Negate to get root mover's perspective.
let value = -negamax(state, NEG_INF, POS_INF, tt, occupied);
```

Remove `current_is_player` and the `Owner::Player` evaluating_for comment.

- [ ] **Step 2: Update robustness (second pass)**

Replace the robustness inner call. After our move is applied (opponent's turn) and opponent response is applied (root mover's turn again):

```rust
// 2 plies from root = root mover's turn. negamax returns from root mover's perspective.
// No negation needed — compare directly to `value` (also root mover's perspective).
let response_value = negamax(state, NEG_INF, POS_INF, tt, occupied);
```

Replace the tier comparison (Plan 1 introduced `current_is_player`-based tier logic). Since both values are now from root mover's perspective, simplify to:

```rust
// Both value and response_value are from root mover's perspective.
// Reuse the outcome_tier helper from Plan 1, or inline it here.
let tier = |v: i32| if v > 0 { 0u8 } else if v == 0 { 1 } else { 2 };
let move_tier = tier(value);
let resp_tier = tier(response_value);
if resp_tier < move_tier { better_outcome_count += 1; }
```

- [ ] **Step 3: Update score conversion**

After Plan 1, `find_best_move_with` converts the value to raw score using `effective_value`:
```rust
let effective_value = if current_is_player { value } else { -value };
let score = (effective_value + 5) as u8;
```

With negamax, `value` is already from root mover's perspective. No sign flip needed:
```rust
let score = (value + 5) as u8;
```

Remove `current_is_player` variable entirely.

- [ ] **Step 4: Remove the perspective-pinning comment**

Delete or update the comment at lines 201-204:
```rust
// All minimax calls use Owner::Player as evaluating_for so TT values are always from
// Player's perspective. This makes TT entries safe to reuse across turns even when
// the persistent solver is in use (current_turn flips each turn, but stored values
// never change meaning).
```

Replace with:
```rust
// negamax values are from the mover's perspective. TT entries are keyed by hash_state
// which includes current_turn, so entries for Player-to-move and Opponent-to-move
// never collide. The persistent Solver's TT reuse across turns is safe.
```

- [ ] **Step 5: Run all Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark`
Expected: ALL tests PASS. This is the critical verification — the negamax refactor is behavior-preserving, so every test that passed with minimax must still pass.

- [ ] **Step 6: Commit**

```
git add engine-rs/src/solver.rs
git commit -m 'refactor(solver): replace minimax with negamax'
```

---

### Task 3: Verify TT persistence still works

**Files:** None (verification only)

**Context:** The persistent `Solver` struct reuses its TT across turns. With minimax, all TT values were from Player's perspective (pinned `evaluating_for`). With negamax, TT values are from the mover's perspective. This should still be safe because `hash_state` includes `current_turn`, segregating entries. But we need to confirm the cross-turn tests pass.

- [ ] **Step 1: Run TT-specific tests explicitly**

Run: `cargo test --manifest-path engine-rs/Cargo.toml -- tt_`
This should run: `tt_empty_after_reset`, `tt_populated_after_solve`, `tt_size_unchanged_solving_same_state_twice`.

Expected: All PASS.

- [ ] **Step 2: Run cross-turn and solver-reuse tests**

Run: `cargo test --manifest-path engine-rs/Cargo.toml -- cross_turn`
Run: `cargo test --manifest-path engine-rs/Cargo.toml -- solver_reuses_tt`
Run: `cargo test --manifest-path engine-rs/Cargo.toml -- solver_solve_matches`

Expected: All PASS.

- [ ] **Step 3: Run self-play tests (slow but critical)**

Run: `cargo test --manifest-path engine-rs/Cargo.toml -- self_play --ignored`

Expected: Both self-play tests PASS — the predicted score matches the actual game outcome.

- [ ] **Step 4: Run WASM tests**

Run: `cd engine-rs && wasm-pack build --target web && cd ..`
Run: `bun test tests/engine/solver.wasm.test.ts`

Expected: All WASM solver fixture tests and PIMC benchmark PASS.

- [ ] **Step 5: Commit (if any fixes were needed)**

If everything passed, no commit needed. If fixes were required, commit them:
```
git add engine-rs/src/solver.rs
git commit -m 'fix(solver): correct negamax TT interaction after refactor'
```

---

### Task 4: Clean up dead code and update comments

**Files:**
- Modify: `engine-rs/src/solver.rs` (comments, ABOUTME)

- [ ] **Step 1: Update ABOUTME comment**

Line 1: `// ABOUTME: Minimax solver with alpha-beta pruning and transposition table.`
Change to: `// ABOUTME: Negamax solver with alpha-beta pruning and transposition table.`

- [ ] **Step 2: Update function doc comment**

The `negamax` function should have a clear doc comment:
```rust
// Negamax with alpha-beta pruning. Returns value from the mover's perspective.
// Range: -4 to +4 (mover_score - 5).
```

- [ ] **Step 3: Search for stale comments referencing minimax or evaluating_for**

Search `engine-rs/src/solver.rs` for:
- "minimax" (should be "negamax" or removed)
- "evaluating_for" (should be gone)
- "Player's perspective" (should be "mover's perspective")
- "is_maximizing" (should be gone)

Fix any stale references.

- [ ] **Step 4: Update lib.rs WASM doc comment**

`engine-rs/src/lib.rs:57`: `/// WASM PIMC entry point: accepts a JSON-serialized fully-resolved GameState, runs one minimax simulation...`
Change "minimax" to "negamax".

- [ ] **Step 5: Update solver-wasm.worker.ts ABOUTME**

Line 1-2: References "minimax solver". Update to "negamax solver" or just "solver".

- [ ] **Step 6: Run tests once more to confirm nothing broke**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark`
Expected: All PASS.

- [ ] **Step 7: Commit**

```
git add engine-rs/src/solver.rs engine-rs/src/lib.rs src/engine/solver-wasm.worker.ts
git commit -m 'docs: update comments from minimax to negamax terminology'
```

---

### Task 5: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full Rust test suite**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark`
Expected: All tests PASS.

- [ ] **Step 2: Run full TS test suite**

Run: `bun run test`
Expected: All tests PASS.

- [ ] **Step 3: Run TypeScript type check**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify no stale minimax references**

```bash
rg 'minimax|evaluating_for|is_maximizing' --glob '*.{ts,rs}' --glob '!target' --glob '!node_modules'
```
Expected: Zero matches (or only in comments that intentionally reference the old approach for historical context — but prefer removing those).
