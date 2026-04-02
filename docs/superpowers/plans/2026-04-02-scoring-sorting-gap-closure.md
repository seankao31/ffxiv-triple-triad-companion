# Scoring & Sorting Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 4 test gaps identified in `docs/decisions/2026-04-02-scoring-sorting-analysis.md` — one mutation survivor and three untested behaviors.

**Architecture:** All changes are test-only. No production code changes. Rust tests in `engine-rs/src/solver.rs` (mod tests), WASM test in `tests/engine/solver.wasm.test.ts`, store test in `tests/app/store.test.ts`.

**Tech Stack:** Rust (cargo test), Bun (bun test), Vitest (bunx vitest run)

---

### Task 1: Fix robustness tier mutation survivor (Rust)

The robustness tier function at `engine-rs/src/solver.rs:249` has a mutation
`v > 0` → `v >= 0` that survives all tests. This mutation makes draws appear to
have robustness 0 (same as wins) instead of their actual value. We need a test
where a draw move has non-zero robustness because the opponent can blunder into
a win for us.

**Game state design:** Board with 7 cells filled, 2 empty (positions 7 and 8).
Player has 1 card, opponent has 2 cards. It's player's turn.

- Player card: (10, 10, 1, 10) — strong on top/right/left, weak bottom
- Board at position 4: Player card (1, 1, 10, 1) — strong bottom edge faces pos 7
- Opponent cards: one weak (1,1,1,1) and one strong (10,10,10,10)

After Player places at pos 7: the pos-4 card's bottom=10 defends against captures
from above. Player has 5 cards (4 on board + 1 just placed = 5). If the strong
opponent plays at pos 8, it captures pos 7 (10>1 on left edge) → Player owns 4 →
loss. If the weak opponent plays at pos 8 → 1<1 no capture → Player owns 5 → draw.
So from our move's perspective: the move is a draw (best outcome with perfect
opponent play), and 1 of the opponent's 4 responses leads to us winning (opponent
blunders by playing weak card). Robustness should be > 0.

This is the same board from the existing `prefers_draw_move_with_more_opponent_mistakes`
test (line 466), which already has draws with calculable robustness. We just need to
assert the exact robustness *value* for a draw move, not just the ordering.

**Files:**
- Modify: `engine-rs/src/solver.rs:499` (add new test after `prefers_draw_move_with_more_opponent_mistakes`)

- [ ] **Step 1: Write the failing test**

Add this test after the `prefers_draw_move_with_more_opponent_mistakes` test
(after line 499 in `engine-rs/src/solver.rs`):

```rust
    #[test]
    fn draw_robustness_nonzero_when_opponent_can_blunder_into_win() {
        // Reuses the same board as prefers_draw_move_with_more_opponent_mistakes.
        // Both moves are draws, but the opponent can blunder (play weak card at the
        // wrong spot) and give us a win. Robustness must be > 0 for draws.
        // This catches the mutation v > 0 → v >= 0 in the robustness tier function,
        // which would collapse draws into the "win" tier and make robustness = 0.
        reset_card_ids();
        let filler    = create_card(1,  1,  1, 1, CardType::None);
        let pos4_card = create_card(1,  1, 10, 1, CardType::None);
        let p_card    = create_card(10, 10, 1, 10, CardType::None);
        let o1        = create_card(1,  1,  1, 1, CardType::None);
        let o2        = create_card(10, 10, 10, 10, CardType::None);

        let board: Board = [
            Some(PlacedCard { card: filler,    owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Opponent }),
            Some(PlacedCard { card: filler,    owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Opponent }),
            Some(PlacedCard { card: pos4_card, owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Opponent }),
            None,
            None,
        ];

        let state = GameState {
            board,
            player_hand: vec![p_card],
            opponent_hand: vec![o1, o2],
            current_turn: Owner::Player,
            rules: no_rules(),
        };

        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 2);
        assert!(moves.iter().all(|m| m.score == 5), "Expected all draws");
        // Both draw moves must have non-zero robustness — the opponent can blunder
        // (play weak card) and give us a win in some responses.
        for m in &moves {
            assert!(m.robustness > 0.0,
                "Draw at pos {} should have non-zero robustness, got {}",
                m.position, m.robustness);
        }
    }
```

- [ ] **Step 2: Verify test passes (not a TDD red step — this is tightening coverage for an existing code path)**

Run: `cargo test --manifest-path engine-rs/Cargo.toml -- draw_robustness_nonzero_when_opponent_can_blunder_into_win`

Expected: PASS

- [ ] **Step 3: Verify the mutation is now caught**

Temporarily mutate `engine-rs/src/solver.rs:249` from:
```rust
let tier = |v: i32| if v > 0 { 0u8 } else if v == 0 { 1 } else { 2 };
```
to:
```rust
let tier = |v: i32| if v >= 0 { 0u8 } else if v == 0 { 1 } else { 2 };
```

Run: `cargo test --manifest-path engine-rs/Cargo.toml -- draw_robustness_nonzero`

Expected: FAIL — robustness becomes 0.0 because draws are misclassified as wins.

Revert the mutation immediately after confirming the kill.

- [ ] **Step 4: Commit**

```
git add engine-rs/src/solver.rs
git commit -m 'test(solver): add draw robustness assertion to catch tier threshold mutation'
```

---

### Task 2: Strengthen tier boundary assertion (Rust)

The `ranks_winning_above_drawing_above_losing` test (line 437) uses a
non-decreasing invariant that can be satisfied even when the sort misclassifies
tiers, if the secondary/tertiary keys happen to separate them. Add an assertion
that directly checks the tier boundary: the first draw must appear strictly after
the last win.

**Files:**
- Modify: `engine-rs/src/solver.rs:455-461` (strengthen existing test)

- [ ] **Step 1: Add tier-boundary assertions to the existing test**

Replace the assertion block at lines 455–461 in `ranks_winning_above_drawing_above_losing`:

```rust
        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 12);
        let tier = |s: u8| if s > 5 { 0u8 } else if s == 5 { 1 } else { 2 };
        // Non-decreasing tier order (existing invariant)
        for i in 1..moves.len() {
            assert!(tier(moves[i].score) >= tier(moves[i - 1].score));
        }
        // Tier boundaries: verify exact counts, not just ordering.
        // This game state produces 3 wins, 8 draws, 1 loss.
        let win_count = moves.iter().filter(|m| m.score > 5).count();
        let draw_count = moves.iter().filter(|m| m.score == 5).count();
        let loss_count = moves.iter().filter(|m| m.score < 5).count();
        assert_eq!(win_count, 3, "Expected 3 wins");
        assert_eq!(draw_count, 8, "Expected 8 draws");
        assert_eq!(loss_count, 1, "Expected 1 loss");
        // First non-win must be a draw, not another win (catches >= 5 tier mutation)
        assert_eq!(tier(moves[win_count].score), 1, "First move after wins should be a draw");
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cargo test --manifest-path engine-rs/Cargo.toml -- ranks_winning_above_drawing_above_losing`

Expected: PASS

- [ ] **Step 3: Commit**

```
git add engine-rs/src/solver.rs
git commit -m 'test(solver): strengthen tier ordering test with exact boundary assertions'
```

---

### Task 3: Add `wasm_simulate` top-move correctness test (WASM)

`wasm_simulate` returns `moves.into_iter().next()` — the best move after sorting.
No test verifies this is correct. Compare its output against `wasm_solve()[0]` for
the `solver_late_game_win` fixture (which has exactly one move, making the
comparison unambiguous).

**Files:**
- Modify: `tests/engine/solver.wasm.test.ts` (add test after line 231, the
  `WasmSolver.solve() returns same results as wasm_solve()` test)

- [ ] **Step 1: Write the test**

Add after line 231 in `solver.wasm.test.ts`:

```typescript
  it('wasm_simulate returns the top-ranked move from wasm_solve', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, 'solver_late_game_win.json'), 'utf-8'));
    const stateJson = JSON.stringify(fixture.state);

    const solveResult: WasmMove[] = JSON.parse(wasm_solve(stateJson));
    const simResult: WasmMove | null = JSON.parse(wasm_simulate(stateJson));

    expect(simResult).not.toBeNull();
    expect(simResult!.card.id).toBe(solveResult[0]!.card.id);
    expect(simResult!.position).toBe(solveResult[0]!.position);
    expect(simResult!.score).toBe(solveResult[0]!.score);
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test tests/engine/solver.wasm.test.ts -t "wasm_simulate returns the top-ranked"`

Expected: PASS

- [ ] **Step 3: Commit**

```
git add tests/engine/solver.wasm.test.ts
git commit -m 'test(wasm): verify wasm_simulate returns the top-ranked move from wasm_solve'
```

---

### Task 4: Add PIMC confidence sort order test (store)

The store's PIMC handler (`store.ts:125`) sorts by confidence descending. The
existing test sends all sim-results with the same card to the same set of
positions, giving uniform confidence. We need results with *different* confidence
values to test the sort.

**Design:** Send 50 sim-results where 30 vote for position 0 and 20 vote for
position 1 (same card). After aggregation, position 0 should have confidence 0.6
and position 1 should have 0.4. Assert `rankedMoves[0].confidence >
rankedMoves[1].confidence`.

**Files:**
- Modify: `tests/app/store.test.ts` (add test inside the `PIMC parallel dispatch` describe block, after the `sets rankedMoves and clears loading` test)

- [ ] **Step 1: Write the test**

Add after line 675 in `tests/app/store.test.ts`, inside the `PIMC parallel dispatch` describe block:

```typescript
  it('sorts PIMC results by confidence descending', () => {
    setupThreeOpen();
    const poolWorkers = workerInstances.slice(1);
    const simMsgs = poolWorkers.flatMap((w) =>
      w.postedMessages.filter((m: any) => (m as any).type === 'simulate'),
    ) as Array<{ generation: number; simIndex: number }>;
    const gen = simMsgs[0]!.generation;

    const card = createCard(5, 5, 5, 5);
    // Send 50 results: first 30 vote for position 0, next 20 for position 1.
    let sent = 0;
    poolWorkers.forEach((w) => {
      const workerSims = w.postedMessages.filter((m: any) => (m as any).type === 'simulate') as any[];
      workerSims.forEach((msg) => {
        const position = sent < 30 ? 0 : 1;
        w.onmessage!({
          data: {
            type: 'sim-result',
            move: { card, position, score: 7, robustness: 1 },
            generation: gen,
            simIndex: msg.simIndex,
          },
        } as MessageEvent);
        sent++;
      });
    });

    const moves = get(rankedMoves);
    expect(moves.length).toBe(2);
    expect(moves[0]!.confidence).toBeGreaterThan(moves[1]!.confidence!);
    expect(moves[0]!.position).toBe(0);
    expect(moves[1]!.position).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bunx vitest run tests/app/store.test.ts -t "sorts PIMC results by confidence descending"`

Expected: PASS

- [ ] **Step 3: Commit**

```
git add tests/app/store.test.ts
git commit -m 'test(store): verify PIMC results are sorted by confidence descending'
```
