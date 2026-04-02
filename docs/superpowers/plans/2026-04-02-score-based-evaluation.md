# Score-Based Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WIN/DRAW/LOSS (1/0/-1) evaluation with a numeric score (1-9) representing the number of cards the current player owns at game end, enabling margin-aware move ranking while preserving win-rate-first sorting.

**Architecture:** `terminal_value` returns `mover_score - 5` (range -4 to +4, symmetric around zero). `RankedMove` gains a `score: u8` field (raw 1-9 from current player's perspective) and loses the `Outcome` enum field. The `Outcome` enum is deleted from both engines. Sorting remains outcome-tier-first (derived from score vs 5), robustness-second, score-third as tiebreaker. Robustness is still defined on outcome tiers (win/draw/loss), not raw score.

**Tech Stack:** Rust (engine-rs), TypeScript (src/engine), Svelte 5 (UI), bun test + cargo test

**Key design decisions from discussion with Sean:**
- Score range is 1-9 (0 and 10 are impossible: the player who empties their hand also plays the last card, guaranteeing ≥1; opponent always has ≥1 from their hand card)
- `score - 5` is required for negamax compatibility (Plan 2): `(player_score - 5) = -(opponent_score - 5)` since scores sum to 10
- `Outcome` enum is fully removed — win/draw/loss is derived: `score > 5` → win, `= 5` → draw, `< 5` → loss
- Robustness counts outcome-tier improvements (win > draw > loss), NOT score improvements — maximizing win rate is the priority over maximizing margin
- Score is a tiebreaker only: same outcome tier + same robustness → prefer higher score

---

### Task 1: Update Rust types — replace Outcome with score in RankedMove

**Files:**
- Modify: `engine-rs/src/types.rs:69-85` (delete `Outcome` enum, update `RankedMove`)

**Context:** The `Outcome` enum is at lines 69-75, `RankedMove` at 77-85. `RankedMove` currently has `outcome: Outcome`. We replace it with `score: u8`. The `Outcome` enum is deleted entirely.

- [ ] **Step 1: Write failing test for score field on RankedMove**

In `engine-rs/src/types.rs`, add a test at the bottom of the existing test module (after line ~250):

```rust
#[test]
fn ranked_move_has_score_field() {
    let card = create_card(5, 5, 5, 5, CardType::None);
    let m = RankedMove { card, position: 0, score: 7, robustness: 0.5, confidence: None };
    assert_eq!(m.score, 7);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path engine-rs/Cargo.toml ranked_move_has_score_field`
Expected: FAIL — `Outcome` still exists, `score` field not found on `RankedMove`

- [ ] **Step 3: Update RankedMove and delete Outcome**

In `engine-rs/src/types.rs`:

Delete the `Outcome` enum (lines 69-75):
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Win,
    Draw,
    Loss,
}
```

Update `RankedMove` (lines 77-85) — replace `outcome: Outcome` with `score: u8`:
```rust
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedMove {
    pub card: Card,
    pub position: u8,
    pub score: u8,
    pub robustness: f64,
    pub confidence: Option<f64>,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path engine-rs/Cargo.toml ranked_move_has_score_field`
Expected: PASS (other tests will fail — that's expected, we fix them in later tasks)

- [ ] **Step 5: Commit**

```
git add engine-rs/src/types.rs
git commit -m 'refactor(types): replace Outcome enum with score field on RankedMove'
```

---

### Task 2: Update Rust solver — terminal_value returns score differential

**Files:**
- Modify: `engine-rs/src/solver.rs:45-55` (`terminal_value`)
- Modify: `engine-rs/src/solver.rs:86-188` (`minimax`)
- Modify: `engine-rs/src/solver.rs:190-301` (`find_best_move_with`)

**Context:** `terminal_value` currently returns {-1, 0, 1}. It must return `mover_score - 5` (range -4 to +4). The `minimax` function passes `evaluating_for` — values are always from `evaluating_for`'s perspective. `find_best_move_with` maps values to `Outcome` at lines 270-273 — this must produce `score` instead. Sorting at lines 285-298 must use outcome-tier-first (derived from score), robustness-second, score-third.

- [ ] **Step 1: Write failing test for score-based terminal value**

Add test in solver tests (after the existing `returns_no_moves_for_full_board` test around line 387):

```rust
#[test]
fn terminal_value_returns_score_differential() {
    reset_card_ids();
    // Board with 8 cells filled. Player's turn, 1 empty cell.
    // Player has strong card (10s), will capture the weak opponent card below.
    let board: Board = [
        Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
        Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
        Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
        Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
        Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
        Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
        Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
        Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
        None,
    ];
    let state = GameState {
        board,
        player_hand: vec![create_card(10,10,10,10,CardType::None)],
        opponent_hand: vec![],
        current_turn: Owner::Player,
        rules: no_rules(),
    };

    // Player places at pos 8, captures pos 7 and pos 5 (10 > 1 on both edges).
    // Final: player owns 7 cards (5 original + placed + 2 captured), opponent owns 2.
    let moves = find_best_move(&state);
    assert_eq!(moves.len(), 1);
    assert_eq!(moves[0].position, 8);
    assert!(moves[0].score > 5, "Expected winning score (>5), got {}", moves[0].score);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path engine-rs/Cargo.toml terminal_value_returns_score_differential`
Expected: FAIL — compiler errors because solver still references `Outcome`

- [ ] **Step 3: Remove Outcome from production import and update terminal_value**

Remove `Outcome` from the import at line 6:
```rust
use crate::types::{Card, CardType, GameState, Owner, RankedMove};
```

Replace `terminal_value` (lines 45-55) with:

```rust
// Returns mover_score - 5: positive means the player-to-move is winning.
// Range: -4 to +4 (scores are 1-9 since 0 and 10 are impossible).
fn terminal_value(state: &GameState, evaluating_for: Owner) -> i32 {
    let (player, opponent) = crate::types::get_score(state);
    let ef_score = if evaluating_for == Owner::Player { player } else { opponent };
    ef_score as i32 - 5
}
```

- [ ] **Step 4: Update find_best_move_with — value-to-score mapping and sorting**

In `find_best_move_with` (around lines 233-300), update the second pass to produce `score` instead of `outcome`. The value from minimax is now from Player's perspective (range -4 to +4). Convert to raw score for `RankedMove`.

Replace the closure body that builds each `RankedMove` (around lines 268-281). The key change is mapping `effective_value` to a score:

```rust
// value is from Player's perspective; flip when it's Opponent's turn.
let effective_value = if current_is_player { value } else { -value };
// Convert from differential (mover_score - 5) back to raw score (1-9).
let score = (effective_value + 5) as u8;
```

Replace the `Outcome` mapping (lines 270-274) and the `RankedMove` construction (line 281):

```rust
RankedMove { card, position: position as u8, score, robustness, confidence: None }
```

Update the sort (lines 285-298). Derive outcome tier from score for primary sort, robustness for secondary, score for tertiary:

```rust
moves.sort_by(|a, b| {
    // Primary: outcome tier (win > draw > loss). >5 = win (0), =5 = draw (1), <5 = loss (2).
    let tier = |s: u8| if s > 5 { 0u8 } else if s == 5 { 1 } else { 2 };
    let td = tier(a.score).cmp(&tier(b.score));
    if td != std::cmp::Ordering::Equal {
        return td;
    }
    // Secondary: higher robustness first.
    let rd = b.robustness.partial_cmp(&a.robustness).unwrap_or(std::cmp::Ordering::Equal);
    if rd != std::cmp::Ordering::Equal {
        return rd;
    }
    // Tertiary: higher score first (prefer bigger wins / smaller losses).
    b.score.cmp(&a.score)
});
```

- [ ] **Step 5: Update robustness calculation**

The robustness "better outcome" check (lines 256-262) must compare outcome tiers, not raw values. Replace:

```rust
if current_is_player {
    if response_value > value { better_outcome_count += 1; }
} else {
    if response_value < value { better_outcome_count += 1; }
}
```

With:

```rust
// Compare outcome tiers, not raw scores.
// value and response_value are both from Player's perspective.
// "Better for current player" = higher tier from their perspective.
let tier = |v: i32, is_player: bool| {
    let eff = if is_player { v } else { -v };
    if eff > 0 { 0u8 } else if eff == 0 { 1 } else { 2 }
};
let move_tier = tier(value, current_is_player);
let resp_tier = tier(response_value, current_is_player);
if resp_tier < move_tier { better_outcome_count += 1; }
```

(Lower tier number = better outcome: 0=win, 1=draw, 2=loss. So `resp_tier < move_tier` means the response led to a better outcome for the current player, indicating an opponent mistake.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cargo test --manifest-path engine-rs/Cargo.toml terminal_value_returns_score_differential`
Expected: PASS

- [ ] **Step 7: Commit**

```
git add engine-rs/src/solver.rs
git commit -m 'refactor(solver): terminal_value returns score differential, RankedMove uses score field'
```

---

### Task 3: Fix all remaining Rust solver tests

**Files:**
- Modify: `engine-rs/src/solver.rs` (test module, lines 348+)

**Context:** Many tests reference `Outcome::Win`, `Outcome::Draw`, `Outcome::Loss` and `m.outcome`. These must all switch to `m.score` with appropriate comparisons. The `Outcome` import must be removed.

- [ ] **Step 1: Update test imports**

Remove `Outcome` from the test imports (line 353):
```rust
use crate::types::{
    create_card, create_initial_state, get_score, reset_card_ids, Board, CardType, Owner,
    PlacedCard, RuleSet,
};
```

- [ ] **Step 2: Add helper function for outcome tier comparison**

Add at the top of the test module:
```rust
// Helper: derive outcome tier from score for assertions.
// Returns "win", "draw", or "loss".
fn outcome_of(score: u8) -> &'static str {
    if score > 5 { "win" } else if score == 5 { "draw" } else { "loss" }
}
```

- [ ] **Step 3: Update each test**

`ranks_winning_above_drawing_above_losing` (line 418): Replace `Outcome` ordering with score-based tier:
```rust
let tier = |s: u8| if s > 5 { 0u8 } else if s == 5 { 1 } else { 2 };
for i in 1..moves.len() {
    assert!(tier(moves[i].score) >= tier(moves[i - 1].score));
}
```

`prefers_draw_move_with_more_opponent_mistakes` (line 447): Replace `m.outcome == Outcome::Draw`:
```rust
assert!(moves.iter().all(|m| m.score == 5), "Expected all draws (score=5)");
```

`prefers_moves_with_higher_robustness` (line 483): Replace `m.outcome == Outcome::Win`:
```rust
let win_moves: Vec<_> = moves.iter().filter(|m| m.score > 5).collect();
```

`evaluates_from_current_players_perspective_when_opponent_goes_first` (line 500): Replace `Outcome::Win`:
```rust
assert!(moves.iter().all(|m| m.score > 5), "Expected all wins (score>5)");
```

`returns_ranked_moves_when_all_outcomes_are_losses` (line 511): Replace `Outcome::Loss`:
```rust
assert!(moves.iter().all(|m| m.score < 5), "Expected all losses (score<5)");
```

`robustness_nonzero_when_opponent_can_blunder` (line 543): Replace `Outcome::Loss`:
```rust
assert!(moves.iter().all(|m| m.score < 5), "Expected all losses (score<5)");
```

`solver_solve_matches_find_best_move` (line 590): Replace `Outcome` vectors with score vectors:
```rust
let s_scores: Vec<u8> = solver_moves.iter().map(|m| m.score).collect();
let d_scores: Vec<u8> = direct_moves.iter().map(|m| m.score).collect();
assert_eq!(s_scores, d_scores);
```

`cross_turn_predictions_consistent` (line 679): Replace the `mirror` function and `Outcome` comparison. Scores are from the current player's perspective, and player + opponent scores sum to 10. So if player's best opening score is X, opponent's best score after one move is `10 - X`:
```rust
let opening_score = opening_moves[0].score;
// ...
let score_after_1 = moves_after_1[0].score;
// Scores sum to 10: opponent's score from their perspective = 10 - player's opening score.
assert_eq!(score_after_1, 10 - opening_score,
    "Cross-turn score inconsistency: opening={}, after_1={}", opening_score, score_after_1);
```

`flat_tt_solver_correctness_unchanged` (line 789): Replace `Outcome::Win`:
```rust
assert!(moves[0].score > 5, "Expected win (score>5), got {}", moves[0].score);
```

`cross_turn_tt_is_consistent` (line 867): Replace `Outcome` references:
```rust
assert!(moves1[0].score > 5, "Expected win from opening");
// ...
assert!(
    moves2[0].score > 5 || moves2[0].score == 5,
    "TT corruption: turn-2 score = {}", moves2[0].score
);
```

`predicted_loss_move_results_in_loss_when_played_optimally` (line 909): Replace `Outcome::Loss`:
```rust
let loss_move = moves.iter().find(|m| m.score < 5);
```

`solver_handles_plus_rule_without_panic` (line 1096): Replace `Outcome` pattern match — this test just verifies the solver doesn't panic and returns valid moves. With score, simply check the score is in the valid range:
```rust
for m in &moves {
    assert!((1..=9).contains(&m.score), "Invalid score: {}", m.score);
}
```

`self_play_from_opening_achieves_predicted_outcome` (line 999): Replace `Outcome` comparisons:
```rust
let predicted_score = solver.solve(&state)[0].score;
assert!(predicted_score > 5, "Expected winning prediction");
// ... (self-play loop unchanged) ...
let (player_score, opp_score) = crate::types::get_score(&cur);
assert_eq!(player_score as u8, predicted_score,
    "Self-play score {} differs from prediction {}", player_score, predicted_score);
```

`self_play_with_plus_rule_achieves_predicted_outcome` (around line 1030): Replace the entire `predicted_outcome` + `actual_outcome` block (lines 1047-1069). The old code computed `Outcome::Win`/`Loss`/`Draw` from scores and compared them. Replace with direct score comparison:
```rust
let predicted_score = solver.solve(&state)[0].score;
// ... (self-play loop unchanged) ...
let (player_score, _opp_score) = crate::types::get_score(&cur);
assert_eq!(player_score as u8, predicted_score,
    "Self-play score {} differs from prediction {}", player_score, predicted_score);
```
Delete the `actual_outcome` variable and the `Outcome::Win`/`Loss`/`Draw` match block entirely.

- [ ] **Step 4: Run all Rust solver tests**

Run: `cargo test --manifest-path engine-rs/Cargo.toml -- --skip benchmark`
Expected: All solver tests PASS. (Board tests and type tests should be unaffected.)

- [ ] **Step 5: Commit**

```
git add engine-rs/src/solver.rs
git commit -m 'test(solver): update all tests from Outcome enum to score-based assertions'
```

---

### Task 4: Update solver fixture infrastructure

**Files:**
- Modify: `engine-rs/tests/solver_fixtures.rs` (replace `Outcome` with `score`)
- Modify: `tests/fixtures/solver/solver_late_game_win.json` (replace `"outcome"` with `"score"`)
- Modify: `tests/fixtures/solver/solver_opponent_first.json` (replace `"outcome"` with `"score"`)
- Modify: `tests/engine/solver.wasm.test.ts:127` (update fixture assertion)

**Context:** Solver fixtures use `"outcome": "win"` in JSON. The `ExpectedMove` struct in `solver_fixtures.rs` has an `outcome: Outcome` field. These must change to `score: u8`. The WASM test at `solver.wasm.test.ts:127` also parses outcome from fixtures.

Important: The fixture JSON values must be the actual scores from running the solver. Since we're changing the evaluation, we need to compute the correct scores. For the existing fixtures:
- `solver_late_game_win.json`: 1 move, currently `"outcome": "win"` — must determine actual score
- `solver_opponent_first.json`: 9 moves, all `"outcome": "win"` — must determine actual scores
- `solver_full_board.json`: 0 expected moves — no change needed

- [ ] **Step 1: Determine correct scores for existing fixtures**

Write a temporary Rust test that prints scores for each fixture scenario. Or: run the updated solver against the fixture states and inspect the output. The simplest approach: add a `#[test]` that loads fixtures, runs `find_best_move`, and prints each move's score.

```rust
#[test]
fn print_fixture_scores() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let fixtures_dir = std::path::Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join("tests/fixtures/solver");
    for entry in std::fs::read_dir(&fixtures_dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") { continue; }
        let json = std::fs::read_to_string(&path).unwrap();
        // Parse just the state, ignore expected
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        let state: GameState = serde_json::from_value(val["state"].clone()).unwrap();
        let moves = find_best_move(&state);
        println!("=== {} ===", path.file_name().unwrap().to_str().unwrap());
        for m in &moves {
            println!("  card={} pos={} score={} robustness={}", m.card.id, m.position, m.score, m.robustness);
        }
    }
}
```

Run it, record the scores, then delete this test.

- [ ] **Step 2: Update fixture JSON files**

Replace `"outcome": "win"` (or `"draw"` / `"loss"`) with `"score": <value>` in each fixture. Use the scores from step 1.

- [ ] **Step 3: Update solver_fixtures.rs**

Replace the `ExpectedMove` struct:
```rust
#[derive(serde::Deserialize)]
struct ExpectedMove {
    #[serde(rename = "cardId")]
    card_id: u8,
    position: u8,
    score: u8,
    robustness: f64,
}
```

Remove the `Outcome` import (line 5):
```rust
use engine_rs::types::GameState;
```

Update the assertion (line 71-75):
```rust
assert_eq!(
    got.score, exp.score,
    "Fixture '{}' move {i}: score mismatch (got {}, expected {})",
    fixture.name, got.score, exp.score
);
```

- [ ] **Step 4: Update WASM fixture test**

In `tests/engine/solver.wasm.test.ts`, three type definitions and the assertion loop need updating:

Update `ExpectedMove` interface (line 12-17):
```typescript
interface ExpectedMove {
  cardId: number;
  position: number;
  score: number;
  robustness: number;
}
```

Update `WasmMove` type alias (line 25):
```typescript
type WasmMove = { card: { id: number }; position: number; score: number; robustness: number };
```

Update the inline type annotation at line 127 (currently `outcome: string` → `score: number`):
```typescript
const result: Array<{ card: { id: number }; position: number; score: number; robustness: number }> = JSON.parse(resultJson);
```

Update the fixture assertion loop (around line 135) — change `got.outcome`/`exp.outcome` to `got.score`/`exp.score`:
```typescript
expect(got.score).toBe(exp.score);
```

Update two additional `.outcome` comparisons in WasmSolver tests:

Line 229 in "WasmSolver.solve() returns same results as wasm_solve()":
```typescript
expect(solverResult[i]!.score).toBe(wasm_result[i]!.score);
```

Line 281 in "WasmSolver: solve() after reset() still returns correct results":
```typescript
expect(afterReset[i]!.score).toBe(reference[i]!.score);
```

- [ ] **Step 5: Run Rust fixture tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml test_solver_fixtures`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add engine-rs/tests/solver_fixtures.rs tests/fixtures/solver/ tests/engine/solver.wasm.test.ts
git commit -m 'refactor(fixtures): replace outcome with score in solver fixtures and fixture tests'
```

---

### Task 5: Update TypeScript types — replace Outcome with score

**Files:**
- Modify: `src/engine/types.ts:66-78` (delete `Outcome` enum, update `RankedMove`)
- Modify: `src/engine/index.ts:15` (remove `Outcome` export)

**Context:** The TS `Outcome` enum is at types.ts:66-70. `RankedMove` is at types.ts:72-78. The barrel export at index.ts:15 exports `Outcome`.

- [ ] **Step 1: Delete Outcome enum and update RankedMove**

In `src/engine/types.ts`, delete:
```typescript
export enum Outcome {
  Win = "win",
  Draw = "draw",
  Loss = "loss",
}
```

Update `RankedMove`:
```typescript
export interface RankedMove {
  readonly card: Card;
  readonly position: number; // 0-8 board index
  readonly score: number; // 1-9: cards owned by the current player at game end. >5 = win, =5 = draw, <5 = loss.
  readonly robustness: number; // fraction of opponent responses that lead to a strictly better outcome tier
  readonly confidence?: number; // fraction of PIMC simulations where this was the top move (undefined for perfect-information games)
}
```

- [ ] **Step 2: Remove Outcome from barrel export**

In `src/engine/index.ts`, remove `Outcome` from the export list (line 15).

- [ ] **Step 3: Verify TypeScript compiles (expect errors in consumers)**

Run: `bunx tsc --noEmit`
Expected: FAIL with errors in files that still reference `Outcome` — this confirms we haven't missed any usages.
Record the list of files with errors for the next task.

- [ ] **Step 4: Commit**

```
git add src/engine/types.ts src/engine/index.ts
git commit -m 'refactor(engine): replace Outcome enum with score field on RankedMove in TS types'
```

---

### Task 6: Update UI components — derive outcome display from score

**Files:**
- Modify: `src/app/components/game/SolverPanel.svelte`
- Modify: `src/app/components/game/BoardCell.svelte`
- Modify: `src/app/components/game/Board.svelte`

**Context:** SolverPanel uses `Outcome` enum for labels, colors, and filtering best-tier moves. BoardCell uses `Outcome` for evaluation background colors. Board builds a `Map<number, Outcome>`. All must derive win/draw/loss from `score` instead.

- [ ] **Step 1: Update SolverPanel.svelte**

Remove `Outcome` import. Add helper functions and update all Outcome references:

```typescript
type OutcomeTier = 'win' | 'draw' | 'loss';
function tierOf(score: number): OutcomeTier {
  return score > 5 ? 'win' : score === 5 ? 'draw' : 'loss';
}

const outcomeLabel: Record<OutcomeTier, string> = {
  win: 'Win',
  draw: 'Draw',
  loss: 'Loss',
};

const outcomeColor: Record<OutcomeTier, string> = {
  win: 'text-eval-win',
  draw: 'text-eval-draw',
  loss: 'text-eval-loss',
};
```

Update `bestTierMoves` derived:
```typescript
let bestTierMoves = $derived.by(() => {
  if ($rankedMoves.length === 0) return [];
  const bestTier = tierOf($rankedMoves[0]!.score);
  return $rankedMoves.filter(m => tierOf(m.score) === bestTier);
});
```

Update template references:
- `outcomeColor[bestTierMoves[0]!.outcome]` → `outcomeColor[tierOf(bestTierMoves[0]!.score)]`
- `outcomeLabel[bestTierMoves[0]!.outcome]` → `outcomeLabel[tierOf(bestTierMoves[0]!.score)]`
- `move.outcome !== Outcome.Win` → `tierOf(move.score) !== 'win'`

- [ ] **Step 2: Update BoardCell.svelte**

Replace `Outcome` import and usage. The `evaluation` prop type changes from `Outcome` to `OutcomeTier` (or derive inline). Look at how Board passes evaluation to BoardCell.

Update the `evalBg` record to use string keys:
```typescript
type OutcomeTier = 'win' | 'draw' | 'loss';
const evalBg: Record<OutcomeTier, string> = {
  win: 'bg-eval-win/20',
  draw: 'bg-eval-draw/20',
  loss: 'bg-eval-loss/20',
};
```

Update the prop type: `evaluation?: OutcomeTier | null`

- [ ] **Step 3: Update Board.svelte**

Replace `Outcome` import. The board currently builds `Map<number, Outcome>` from ranked moves. Update to use `OutcomeTier`:

```typescript
type OutcomeTier = 'win' | 'draw' | 'loss';
function tierOf(score: number): OutcomeTier {
  return score > 5 ? 'win' : score === 5 ? 'draw' : 'loss';
}
// ...
const map = new Map<number, OutcomeTier>();
// ... m.outcome → tierOf(m.score)
```

- [ ] **Step 4: Consider extracting OutcomeTier to a shared location**

Since `OutcomeTier` and `tierOf` are used in multiple components, consider adding them to `src/app/card-display.ts` or `src/engine/types.ts`. If extracted, update imports accordingly. Alternatively, if only 2-3 files use it, inline is fine.

- [ ] **Step 5: Run TypeScript type check**

Run: `bunx tsc --noEmit`
Expected: Remaining errors should only be in test files (fixed in next task).

- [ ] **Step 6: Commit**

```
git add src/app/components/game/SolverPanel.svelte src/app/components/game/BoardCell.svelte src/app/components/game/Board.svelte
git commit -m 'refactor(ui): derive outcome display from score field instead of Outcome enum'
```

---

### Task 7: Update UI tests and store tests

**Files:**
- Modify: `tests/app/components/SolverPanel.test.ts`
- Modify: `tests/app/components/Board.test.ts`
- Modify: `tests/app/components/GameView.test.ts`
- Modify: `tests/app/components/HandPanel.test.ts`
- Modify: `tests/app/store.test.ts`

**Context:** These tests construct `RankedMove` objects with `outcome: Outcome.Win` etc. All must change to `score: <number>`. Search for all `Outcome` or `outcome:` references in `tests/app/`.

- [ ] **Step 1: Update all test RankedMove constructions**

Replace all `outcome: Outcome.Win` with `score: 7` (arbitrary win score), `outcome: Outcome.Draw` with `score: 5`, `outcome: Outcome.Loss` with `score: 3` (arbitrary loss score).

Remove all `Outcome` imports — replace with nothing (the type is gone).

Key files and patterns:
- `GameView.test.ts`: `outcome: Outcome.Win` → `score: 7`
- `HandPanel.test.ts`: `outcome: Outcome.Win` → `score: 7`
- `Board.test.ts`: `outcome: Outcome.Win` → `score: 7`
- `SolverPanel.test.ts`: Multiple outcomes — update each to appropriate score
- `store.test.ts`: Multiple outcomes — update each. Note line where `expect(get(rankedMoves)[0]!.outcome).toBe(Outcome.Draw)` → `expect(get(rankedMoves)[0]!.score).toBe(5)`

- [ ] **Step 2: Run TypeScript type check**

Run: `bunx tsc --noEmit`
Expected: PASS (no more Outcome references anywhere)

- [ ] **Step 3: Run UI tests**

Run: `bunx vitest run`
Expected: All 167+ tests PASS

- [ ] **Step 4: Commit**

```
git add tests/app/
git commit -m 'test(ui): update all test RankedMove constructions from outcome to score'
```

---

### Task 8: Update WASM worker and store PIMC aggregation

**Files:**
- Modify: `src/engine/solver-wasm.worker.ts` (if any Outcome references)
- Modify: `src/app/store.ts` (if any Outcome references)

**Context:** The worker deserializes `RankedMove` from JSON — since Rust now serializes `score` instead of `outcome`, the JSON shape changes automatically. The store's PIMC aggregation (lines 100-131) uses `move: RankedMove` with spread syntax — should work if the type is correct. Check for any explicit `Outcome` references.

- [ ] **Step 1: Check for remaining Outcome references**

Search for any remaining `Outcome` references in `src/` — there should be none after Tasks 5-6. If found, fix them.

- [ ] **Step 2: Verify the PIMC aggregation spreads correctly**

The store's `handlePoolMessage` (line 121) does `{ ...move, confidence: count / pimcTotal }`. Since `move` now has `score` instead of `outcome`, this should work. The sorting at line 125 sorts by confidence — no outcome reference. Verify no issues.

- [ ] **Step 3: Run all TS tests**

Run: `bun run test`
Expected: All engine tests + UI tests PASS

- [ ] **Step 4: Rebuild WASM and run WASM tests**

Run: `cd engine-rs && wasm-pack build --target web && cd ..`
Run: `bun test tests/engine/solver.wasm.test.ts`
Expected: PASS (fixtures already updated in Task 4)

- [ ] **Step 5: Commit (if any changes were needed)**

```
git add src/engine/ src/app/store.ts
git commit -m 'refactor: remove remaining Outcome references from worker and store'
```

---

### Task 9: Update Rust PIMC and server

**Files:**
- Modify: `engine-rs/src/pimc.rs:9` (remove `Outcome` import if present)
- Modify: `engine-rs/src/bin/server.rs` (remove `Outcome` import if present)

**Context:** `pimc.rs` imports `RankedMove` but may not import `Outcome` directly. `server.rs` may or may not reference `Outcome`. Check both.

- [ ] **Step 1: Check and fix pimc.rs imports**

Line 9: `use crate::types::{Card, CardType, GameState, Owner, RankedMove};` — if `Outcome` is not in this list, no change needed. Verify the PIMC tally/sort logic doesn't reference outcome.

- [ ] **Step 2: Check and fix server.rs**

Check if `server.rs` references `Outcome` anywhere. The solve endpoint returns `Vec<RankedMove>` via serde — the JSON field name changes from `"outcome"` to `"score"` automatically. If there are any explicit `Outcome` references, remove them.

- [ ] **Step 3: Run full Rust test suite**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark`
Expected: All tests PASS

- [ ] **Step 4: Commit (if any changes were needed)**

```
git add engine-rs/src/pimc.rs engine-rs/src/bin/server.rs
git commit -m 'refactor(rust): remove remaining Outcome references from pimc and server'
```

---

### Task 10: Final verification and cleanup

**Files:** None (verification only)

- [ ] **Step 1: Verify no Outcome references remain anywhere**

Search entire codebase:
```bash
rg 'Outcome' --glob '*.{ts,rs,svelte,json}' --glob '!node_modules' --glob '!target'
```
Expected: Zero matches (or only in comments/documentation that should be updated).

- [ ] **Step 2: Run full test suite — all engines**

Run in parallel:
- `bun run test` (all TS tests)
- `cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark` (all Rust tests)

Expected: All tests PASS in both engines.

- [ ] **Step 3: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Manual smoke test (optional)**

If time permits, build WASM and start the dev server to verify the UI displays scores correctly:
```bash
cd engine-rs && wasm-pack build --target web && cd ..
bun run dev
```

- [ ] **Step 5: Final commit if any cleanup was needed**

```
git add -A  # after git status review
git commit -m 'chore: final cleanup of score-based evaluation migration'
```
