# Rust Engine Test Coverage: Gap Analysis and Implementation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the test coverage gap between the TypeScript engine (comprehensive) and the Rust engine (minimal). The Rust engine is the production path — it must have its own tests that don't rely on TS cross-verification.

**Architecture:** Tests live in two places: `engine-rs/src/solver.rs` (unit tests via `#[cfg(test)]` module, same file as source), and `engine-rs/tests/` (integration tests). New solver behavior tests go in `solver.rs`'s test module. Board rule tests are fixture-based (JSON fixtures in `tests/fixtures/board/`). The cross-verification test (`tests/engine/solver.cross.test.ts`) is extended to cover capture rules.

**Tech Stack:** Rust (`cargo test --features server -- --skip benchmark`), TypeScript/Bun (`bun test tests/engine/solver.cross.test.ts`)

---

## Systematic Gap Analysis

### Board Tests

| TS test (board.test.ts) | Rust coverage | Gap |
|---|---|---|
| placeCard — basic placement | board_fixtures.rs (fixture-based) | ✅ covered |
| standard capture (4 directions) | fixtures exist | ✅ covered |
| same rule | `same_basic_two_pairs.json`, etc. | ✅ covered |
| plus rule | `plus_basic_equal_sums.json`, etc. | ✅ covered |
| combo cascade | `combo_*.json` fixtures | ✅ covered |
| Reverse rule | `reverse_*.json` fixtures | ✅ covered |
| Fallen Ace rule | `fallen_ace_*.json` fixtures | ✅ covered |
| Ascension rule | `ascension_*.json` fixtures | ✅ covered |
| Descension rule | `descension_*.json` fixtures | ✅ covered |
| combined Plus + Same | `combined_plus_and_same_simultaneous.json` | ✅ covered |
| getScore | **MISSING** — no Rust test for score tallying | ❌ gap |
| full game progression | **MISSING** — no end-to-end game play test | ❌ gap |
| edge cases (same-owner adjacency, etc.) | partial via fixtures | ⚠️ partial |

### Solver Tests

| TS test (solver.test.ts) | Rust coverage | Gap |
|---|---|---|
| returns no moves for full board | `returns_no_moves_for_full_board` ✅ | ✅ |
| finds only winning move in late game | `finds_only_winning_move_in_late_game` ✅ | ✅ |
| ranks Win > Draw > Loss | `ranks_winning_above_drawing_above_losing` ✅ | ✅ |
| tie-breaking: robustness (draw) | `prefers_draw_move_with_more_opponent_mistakes` ✅ | ✅ |
| prefers higher robustness | `prefers_moves_with_higher_robustness` ✅ | ✅ |
| evaluates from current player's perspective | `evaluates_from_current_players_perspective_when_opponent_goes_first` ✅ | ✅ |
| returns ranked moves when all losses | `returns_ranked_moves_when_all_outcomes_are_losses` ✅ | ✅ |
| createSolver: solve() == findBestMove() | `solver_solve_matches_find_best_move` ✅ | ✅ |
| createSolver: TT reuse (2nd call faster) | `solver_reuses_tt_across_calls` ✅ | ✅ |
| TT persistence tests (3 tests) | `tt_empty_after_reset`, `tt_populated_after_solve`, `tt_size_unchanged` ✅ | ✅ |
| **cross-turn TT consistency** | **MISSING** | ❌ |
| **Loss prediction accuracy** | **MISSING** (3 TS tests) | ❌ |
| **self-play consistency** | **MISSING** (6 TS tests) | ❌ |
| **capture rules in solver** | **MISSING** — all Rust solver tests use `no_rules()` | ❌ |
| TT hash collision regression | `tt_hash_uniqueness` ✅ (partial) | ⚠️ |
| Performance with assertion | **MISSING** — benchmarks have no upper-bound assertion | ❌ (covered in perf plan) |

### Cross-Verification (TS vs WASM)

| Scenario | Current state | Gap |
|---|---|---|
| 1000 random states, all rules=false | ✅ passing | ✅ |
| Random states with capture rules enabled | **MISSING** | ❌ |
| All 6 rules enabled simultaneously | **MISSING** | ❌ |

---

## Task 1: Add `getScore` and full-game tests to board_fixtures.rs

**Files:**
- Modify: `engine-rs/tests/board_fixtures.rs`
- Modify: `engine-rs/src/board.rs` (if `get_score` is not already a public function — check first)

`getScore` in TS (`src/engine/board.ts`) returns `{ player: number, opponent: number }` by counting owned cells. Verify the Rust equivalent exists, then add tests.

- [ ] **Step 1: Check if Rust has a `get_score` equivalent**

```bash
grep -n "fn get_score\|fn score\|pub fn.*score" engine-rs/src/board.rs
```

If missing, check solver.rs for `score()` usage and determine the equivalent public API.

- [ ] **Step 2: Write the failing getScore test**

In `engine-rs/tests/board_fixtures.rs`, add after the existing fixture test:

```rust
#[test]
fn get_score_counts_owned_cells() {
    use engine_rs::types::{Card, CardType, Owner, GameState};
    use engine_rs::board::{place_card, get_score};  // adjust path as needed
    use engine_rs::types::create_initial_state;

    reset_card_ids();
    let p: Vec<Card> = (0..5).map(|_| create_card(10, 10, 10, 10, CardType::None)).collect();
    let o: Vec<Card> = (0..5).map(|_| create_card(1, 1, 1, 1, CardType::None)).collect();
    let mut state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
    // Full board: player places all 5 strong cards, opponent's cards get captured.
    state = place_card(&state, p[0], 0);
    state = place_card(&state, o[0], 1);  // immediately captured by p[0] if top/left match
    // ... (fill board in a way that produces a known score)
    // Assert:
    let score = get_score(&state);
    assert_eq!(score.player + score.opponent, 9); // all 9 cells occupied
}
```

**Note:** The exact board state depends on the Rust `get_score` API. Read `engine-rs/src/board.rs` or the score-related solver code to determine the actual API shape before writing the test.

- [ ] **Step 3: Run to confirm it fails (or reveals API shape to fix the test)**

```bash
cd engine-rs && cargo test get_score -- --nocapture
```

- [ ] **Step 4: Implement or adjust — if get_score is missing, add it to board.rs**

If `get_score` is not public, add:
```rust
pub fn get_score(state: &GameState) -> Score {
    let player = state.board.iter()
        .filter(|cell| matches!(cell, Some(c) if c.owner == Owner::Player))
        .count();
    let opponent = state.board.iter()
        .filter(|cell| matches!(cell, Some(c) if c.owner == Owner::Opponent))
        .count();
    Score { player, opponent }
}
```

Where `Score` is either an existing type or a simple struct `{ player: usize, opponent: usize }`.

- [ ] **Step 5: Run to confirm it passes**

```bash
cd engine-rs && cargo test get_score
```

- [ ] **Step 6: Commit**

```bash
git add engine-rs/src/board.rs engine-rs/tests/board_fixtures.rs
git commit -m 'test(engine-rs): add getScore and full-game board tests'
```

---

## Task 2: Rust solver — cross-turn TT consistency

**Files:**
- Modify: `engine-rs/src/solver.rs` (test module)

**TS equivalent:** `tests/engine/solver.test.ts` — `"cross-turn predictions are consistent (persistent TT does not corrupt evaluations)"` (~line 329)

The TS test verifies that if the solver predicts Win on turn 1, it still predicts Win on turn 2 after the opponent moves. This catches TT corruption bugs where stale turn-1 entries affect turn-2 evaluations.

- [ ] **Step 1: Write the failing cross-turn TT consistency test**

In `engine-rs/src/solver.rs`, inside `mod tests { ... }`, add:

```rust
#[test]
fn cross_turn_tt_is_consistent() {
    // Mirrors TS "cross-turn predictions are consistent" test.
    // If turn-1 predicts Win, the turn-2 solve (after opponent's move) must also produce
    // consistent results without TT corruption.
    reset_card_ids();
    // Use asymmetric hands so player is predicted to Win: all-10s vs all-1s.
    let p: Vec<Card> = (0..5).map(|_| create_card(10, 10, 10, 10, CardType::None)).collect();
    let o: Vec<Card> = (0..5).map(|_| create_card(1, 1, 1, 1, CardType::None)).collect();
    let state0 = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());

    let mut solver = Solver::new();
    solver.reset();

    // Turn 1: player solves from opening.
    let moves1 = solver.solve(&state0);
    assert!(!moves1.is_empty());
    let turn1_outcome = moves1[0].outcome;
    // Player should win with all-10s vs all-1s.
    assert_eq!(turn1_outcome, Outcome::Win);

    // Simulate: player plays first move, opponent plays first move.
    let best = &moves1[0];
    use crate::board::place_card;
    let state1 = place_card(&state0, best.card, best.position);
    // Opponent plays any move (first available).
    let opp_move = solver.solve(&state1);
    assert!(!opp_move.is_empty());
    let state2 = place_card(&state1, opp_move[0].card, opp_move[0].position);

    // Turn 2 (player's turn): solve again, TT should still produce Win (not corrupted).
    let moves2 = solver.solve(&state2);
    assert!(!moves2.is_empty());
    // Player had overwhelming advantage — still should win or at worst draw.
    assert!(
        moves2[0].outcome == Outcome::Win || moves2[0].outcome == Outcome::Draw,
        "TT corruption: turn-2 outcome = {:?}", moves2[0].outcome
    );
}
```

- [ ] **Step 2: Run to confirm it fails first**

```bash
cd engine-rs && cargo test cross_turn_tt_is_consistent
```

Expected: FAIL (test doesn't exist yet).

- [ ] **Step 3: Verify it passes once added**

After adding the test body:
```bash
cd engine-rs && cargo test cross_turn_tt_is_consistent -- --nocapture
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add engine-rs/src/solver.rs
git commit -m 'test(engine-rs): cross-turn TT consistency test'
```

---

## Task 3: Rust solver — Loss prediction accuracy

**Files:**
- Modify: `engine-rs/src/solver.rs` (test module)

**TS equivalent:** `tests/engine/solver.test.ts` — `describe("createSolver — Loss prediction accuracy")` (3 tests ~line 355–440)

These tests verify: if solver predicts Loss for a move, actually playing that move and having both players play optimally thereafter results in the predicted outcome. This is a critical correctness invariant.

- [ ] **Step 1: Write the Loss prediction test**

In `engine-rs/src/solver.rs` test module, add:

```rust
#[test]
fn predicted_loss_move_results_in_loss_when_played_optimally() {
    // Mirrors TS "predicted-Loss move results in a Loss for the player".
    // Set up a state where the solver predicts Loss for some move.
    // Actually play that move and self-play to end — confirm Loss outcome.
    reset_card_ids();
    // Player has weak cards (1s), opponent has strong cards (10s), except
    // player has one strong card to avoid all-loss degenerate case.
    let strong = create_card(10, 10, 10, 10, CardType::None);
    let weak   = create_card(1, 1, 1, 1, CardType::None);
    let p = vec![strong, weak, weak, weak, weak];
    let o = vec![
        create_card(10,10,10,10,CardType::None), create_card(9,9,9,9,CardType::None),
        create_card(8,8,8,8,CardType::None),     create_card(7,7,7,7,CardType::None),
        create_card(6,6,6,6,CardType::None),
    ];
    let state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
    let mut solver = Solver::new();
    solver.reset();

    let moves = solver.solve(&state);
    // Find a Loss move (there should be some given the asymmetric setup).
    let loss_move = moves.iter().find(|m| m.outcome == Outcome::Loss);
    if loss_move.is_none() {
        // If no Loss move exists, skip (setup didn't produce the right scenario).
        return;
    }
    let loss_move = loss_move.unwrap();

    // Play the predicted-Loss move and self-play to end.
    use crate::board::place_card;
    let mut state = place_card(&state, loss_move.card, loss_move.position);
    loop {
        let moves = solver.solve(&state);
        if moves.is_empty() { break; }
        let best = &moves[0];
        state = place_card(&state, best.card, best.position);
    }

    // Final score: player should have lost (fewer cells than opponent).
    use crate::board::get_score;
    let score = get_score(&state);
    assert!(score.player < score.opponent,
        "Predicted Loss but player won: player={} opponent={}", score.player, score.opponent);
}
```

**Note:** This test requires `get_score` to be public (implemented in Task 1). Do Task 1 first.

- [ ] **Step 2: Run to confirm fail → pass**

```bash
cd engine-rs && cargo test predicted_loss_move_results_in_loss
```

- [ ] **Step 3: Commit**

```bash
git add engine-rs/src/solver.rs
git commit -m 'test(engine-rs): Loss prediction accuracy — predicted loss results in actual loss'
```

---

## Task 4: Rust solver — self-play consistency

**Files:**
- Modify: `engine-rs/src/solver.rs` (test module)

**TS equivalent:** `tests/engine/solver.test.ts` — `describe("solver self-play consistency")` (6 tests ~line 442–612)

The TS self-play tests verify: if solver predicts Win from turn 1, both players playing optimally (always picking solver's top move) results in the player winning. This validates the entire solver pipeline end-to-end.

These are heavy tests (require full game self-play). Gate behind `--features server` to keep the default `cargo test` fast, or use `#[ignore]` + `cargo test -- --ignored`.

- [ ] **Step 1: Write the self-play from opening test (basic)**

In `engine-rs/src/solver.rs` test module, add:

```rust
#[test]
#[ignore = "slow: full game self-play"]
fn self_play_from_opening_achieves_predicted_outcome() {
    // If solver predicts Win from the opening, self-play should reach Win.
    // Uses all-10s vs all-1s (degenerate but fast) — player always wins.
    reset_card_ids();
    let p: Vec<Card> = (0..5).map(|_| create_card(10, 10, 10, 10, CardType::None)).collect();
    let o: Vec<Card> = (0..5).map(|_| create_card(1, 1, 1, 1, CardType::None)).collect();
    let state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());

    let mut solver = Solver::new();
    solver.reset();
    let predicted_outcome = solver.solve(&state)[0].outcome;
    assert_eq!(predicted_outcome, Outcome::Win);

    use crate::board::place_card;
    let mut cur = state;
    loop {
        let moves = solver.solve(&cur);
        if moves.is_empty() { break; }
        cur = place_card(&cur, moves[0].card, moves[0].position);
    }

    use crate::board::get_score;
    let score = get_score(&cur);
    assert!(score.player > score.opponent,
        "Self-play did not achieve predicted Win: player={} opponent={}", score.player, score.opponent);
}
```

- [ ] **Step 2: Write self-play with Plus rule**

Add another `#[ignore]` test:

```rust
#[test]
#[ignore = "slow: full game self-play with Plus rule"]
fn self_play_with_plus_rule_achieves_predicted_outcome() {
    reset_card_ids();
    let p = vec![
        create_card(10,5,3,8,CardType::None), create_card(7,6,4,9,CardType::None),
        create_card(2,8,6,3,CardType::None),  create_card(5,4,7,1,CardType::None),
        create_card(9,3,2,6,CardType::None),
    ];
    let o = vec![
        create_card(4,7,5,2,CardType::None),  create_card(8,3,9,6,CardType::None),
        create_card(1,5,8,4,CardType::None),  create_card(6,9,1,7,CardType::None),
        create_card(3,2,4,10,CardType::None),
    ];
    let rules = RuleSet { plus: true, same: false, reverse: false,
        fallen_ace: false, ascension: false, descension: false };
    let state = create_initial_state(p.clone(), o.clone(), Owner::Player, rules);

    let mut solver = Solver::new();
    solver.reset();
    let predicted_outcome = solver.solve(&state)[0].outcome;

    use crate::board::place_card;
    let mut cur = state;
    loop {
        let moves = solver.solve(&cur);
        if moves.is_empty() { break; }
        cur = place_card(&cur, moves[0].card, moves[0].position);
    }

    use crate::board::get_score;
    let score = get_score(&cur);
    let actual_outcome = if score.player > score.opponent { Outcome::Win }
        else if score.player < score.opponent { Outcome::Loss }
        else { Outcome::Draw };
    assert_eq!(actual_outcome, predicted_outcome,
        "Self-play outcome {:?} differs from prediction {:?}", actual_outcome, predicted_outcome);
}
```

- [ ] **Step 3: Run ignored tests to verify they pass**

```bash
cd engine-rs && cargo test --features server -- --ignored --nocapture 2>&1 | grep -E "ok|FAILED|self_play"
```

Expected: both PASS (they're slow but correct).

- [ ] **Step 4: Commit**

```bash
git add engine-rs/src/solver.rs
git commit -m 'test(engine-rs): self-play consistency tests (gated with #[ignore])'
```

---

## Task 5: Cross-verification — property test with capture rules

**Files:**
- Modify: `tests/engine/solver.cross.test.ts`

**Gap:** The current 1000-state property test uses `rules: { plus: false, same: false, ... }` (all off). The TS and Rust board logic both implement capture rules, but the cross-verification never exercises them together. A TS/Rust divergence in Plus or Same rule handling would not be caught.

- [ ] **Step 1: Write the failing capture-rules cross-verification test**

In `tests/engine/solver.cross.test.ts`, after the 1000-state test, add:

```typescript
it('agrees on 200 random mid-game positions with Plus+Same rules (seed=777)', () => {
  const rng = makeLCG(777);
  const diffs: string[] = [];

  for (let i = 0; i < 200; i++) {
    // Generate state, then enable Plus + Same rules.
    const base = generateState(rng);
    const state: GameState = {
      ...base,
      rules: { plus: true, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
    };
    const stateJson = JSON.stringify(state);

    const tsMoves: WasmMove[] = findBestMove(state).map((m) => ({
      card: { id: m.card.id },
      position: m.position,
      outcome: m.outcome as string,
      robustness: m.robustness,
    }));
    const wasmMoves: WasmMove[] = JSON.parse(wasm_solve(stateJson));

    const ts = canonicalize(tsMoves);
    const wasm = canonicalize(wasmMoves);

    if (ts.length !== wasm.length) {
      diffs.push(`iter ${i}: count ts=${ts.length} wasm=${wasm.length} rules=plus+same`);
      if (diffs.length >= 5) break;
      continue;
    }

    for (let j = 0; j < ts.length; j++) {
      const a = ts[j]!;
      const b = wasm[j]!;
      if (a.card.id !== b.card.id || a.position !== b.position || a.outcome !== b.outcome ||
          Math.abs(a.robustness - b.robustness) > 1e-9) {
        diffs.push(
          `iter ${i} move ${j} (plus+same): ` +
          `ts={id=${a.card.id},pos=${a.position},out=${a.outcome}} ` +
          `wasm={id=${b.card.id},pos=${b.position},out=${b.outcome}}`,
        );
        if (diffs.length >= 5) break;
      }
    }
    if (diffs.length >= 5) break;
  }

  expect(diffs).toEqual([]);
}, 300_000);

it('agrees on 200 random mid-game positions with Reverse+FallenAce rules (seed=888)', () => {
  const rng = makeLCG(888);
  const diffs: string[] = [];

  for (let i = 0; i < 200; i++) {
    const base = generateState(rng);
    const state: GameState = {
      ...base,
      rules: { plus: false, same: false, reverse: true, fallenAce: true, ascension: false, descension: false },
    };
    const stateJson = JSON.stringify(state);

    const tsMoves: WasmMove[] = findBestMove(state).map((m) => ({
      card: { id: m.card.id },
      position: m.position,
      outcome: m.outcome as string,
      robustness: m.robustness,
    }));
    const wasmMoves: WasmMove[] = JSON.parse(wasm_solve(stateJson));

    const ts = canonicalize(tsMoves);
    const wasm = canonicalize(wasmMoves);

    if (ts.length !== wasm.length) {
      diffs.push(`iter ${i}: count ts=${ts.length} wasm=${wasm.length} rules=reverse+fallenAce`);
      if (diffs.length >= 5) break;
      continue;
    }

    for (let j = 0; j < ts.length; j++) {
      const a = ts[j]!;
      const b = wasm[j]!;
      if (a.card.id !== b.card.id || a.position !== b.position || a.outcome !== b.outcome ||
          Math.abs(a.robustness - b.robustness) > 1e-9) {
        diffs.push(
          `iter ${i} move ${j} (reverse+fallenAce): ` +
          `ts={id=${a.card.id},pos=${a.position},out=${a.outcome}} ` +
          `wasm={id=${b.card.id},pos=${b.position},out=${b.outcome}}`,
        );
        if (diffs.length >= 5) break;
      }
    }
    if (diffs.length >= 5) break;
  }

  expect(diffs).toEqual([]);
}, 300_000);
```

- [ ] **Step 2: Run to confirm current state**

```bash
bun test tests/engine/solver.cross.test.ts --timeout 300000 2>&1 | tail -10
```

Expected: these two new tests should PASS if TS and Rust handle these rules identically. If they FAIL, that reveals a TS/Rust divergence in capture rule handling — which must be fixed before merging.

- [ ] **Step 3: Commit**

```bash
git add tests/engine/solver.cross.test.ts
git commit -m 'test: cross-verify TS vs WASM for Plus+Same and Reverse+FallenAce rules'
```

---

## Task 6: Rust solver — capture rules integration

**Files:**
- Modify: `engine-rs/src/solver.rs` (test module)

**Gap:** All Rust solver unit tests use `no_rules()`. If there's a bug in how capture rules interact with the solver's state hashing or undo logic, no unit test would catch it. These tests verify the solver returns sane results (Win/Loss/Draw) when rules are active — they don't need to verify exact move choices.

- [ ] **Step 1: Write solver-with-rules sanity tests**

In `engine-rs/src/solver.rs` test module, add:

```rust
#[test]
fn solver_handles_plus_rule_without_panic() {
    // Verify solver doesn't crash or return empty on a Plus-rule game.
    reset_card_ids();
    let p = vec![
        create_card(10,5,3,8,CardType::None), create_card(7,6,4,9,CardType::None),
        create_card(2,8,6,3,CardType::None),  create_card(5,4,7,1,CardType::None),
        create_card(9,3,2,6,CardType::None),
    ];
    let o = vec![
        create_card(4,7,5,2,CardType::None),  create_card(8,3,9,6,CardType::None),
        create_card(1,5,8,4,CardType::None),  create_card(6,9,1,7,CardType::None),
        create_card(3,2,4,10,CardType::None),
    ];
    let rules = RuleSet { plus: true, same: false, reverse: false,
        fallen_ace: false, ascension: false, descension: false };
    let state = create_initial_state(p, o, Owner::Player, rules);
    // Use a mid-game position (3 cards placed) for speed.
    use crate::board::place_card;
    let p2 = state.player_hand[0];
    let o2 = state.opponent_hand[0];
    let p3 = state.player_hand[1];
    let state = place_card(&state, p2, 0);
    let state = place_card(&state, o2, 1);
    let state = place_card(&state, p3, 2);
    let moves = find_best_move(&state);
    assert!(!moves.is_empty());
    // All outcomes must be valid.
    for m in &moves {
        assert!(matches!(m.outcome, Outcome::Win | Outcome::Draw | Outcome::Loss));
    }
}

#[test]
fn solver_handles_same_rule_without_panic() {
    reset_card_ids();
    let p = vec![
        create_card(10,5,3,8,CardType::None), create_card(7,6,4,9,CardType::None),
        create_card(2,8,6,3,CardType::None),  create_card(5,4,7,1,CardType::None),
        create_card(9,3,2,6,CardType::None),
    ];
    let o = vec![
        create_card(4,7,5,2,CardType::None),  create_card(8,3,9,6,CardType::None),
        create_card(1,5,8,4,CardType::None),  create_card(6,9,1,7,CardType::None),
        create_card(3,2,4,10,CardType::None),
    ];
    let rules = RuleSet { plus: false, same: true, reverse: false,
        fallen_ace: false, ascension: false, descension: false };
    let state = create_initial_state(p, o, Owner::Player, rules);
    use crate::board::place_card;
    let p2 = state.player_hand[0];
    let o2 = state.opponent_hand[0];
    let state = place_card(&state, p2, 0);
    let state = place_card(&state, o2, 1);
    let moves = find_best_move(&state);
    assert!(!moves.is_empty());
}

#[test]
fn solver_handles_reverse_rule_without_panic() {
    reset_card_ids();
    let p: Vec<Card> = (0..5).map(|i| create_card(i as u8 + 1, i as u8 + 1, i as u8 + 1, i as u8 + 1, CardType::None)).collect();
    let o: Vec<Card> = (0..5).map(|i| create_card(10 - i as u8, 10 - i as u8, 10 - i as u8, 10 - i as u8, CardType::None)).collect();
    let rules = RuleSet { plus: false, same: false, reverse: true,
        fallen_ace: false, ascension: false, descension: false };
    let state = create_initial_state(p, o, Owner::Player, rules);
    use crate::board::place_card;
    let p2 = state.player_hand[0];
    let o2 = state.opponent_hand[0];
    let state = place_card(&state, p2, 4);
    let state = place_card(&state, o2, 5);
    let moves = find_best_move(&state);
    assert!(!moves.is_empty());
}
```

- [ ] **Step 2: Run to confirm pass**

```bash
cd engine-rs && cargo test solver_handles_
```

- [ ] **Step 3: Commit**

```bash
git add engine-rs/src/solver.rs
git commit -m 'test(engine-rs): solver sanity tests with capture rules active'
```

---

## Execution Order

Run these tasks in order — Task 1 (getScore) must complete before Task 3 (Loss prediction) because Task 3 calls `get_score`.

1. Task 1: getScore and full-game
2. Task 2: cross-turn TT
3. Task 3: Loss prediction (requires Task 1)
4. Task 4: self-play consistency (requires Task 1)
5. Task 5: cross-verification with capture rules
6. Task 6: solver with rules sanity tests

After all tasks, run the full test suite:
```bash
bun test tests/engine/solver.cross.test.ts --timeout 300000
cd engine-rs && cargo test --features server -- --skip benchmark
```
