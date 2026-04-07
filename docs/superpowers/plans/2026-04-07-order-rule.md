# Order Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Order rule — both players must play cards in hand order (index 0 first), with no choice of which card to play, only where to place it.

**Architecture:** Add `order: boolean` to `RuleSet` in both TS and Rust. Enforce index-0 validation in `placeCard`. Restrict solver move enumeration to the forced card. Auto-select the forced card in the UI.

**Tech Stack:** TypeScript (Svelte 5 UI, Bun test runner), Rust (wasm-pack, cargo test), shared JSON board fixtures.

---

### Task 1: Add `order` field to RuleSet types (TS + Rust)

**Files:**
- Modify: `src/engine/types.ts:49-56` (RuleSet interface)
- Modify: `src/engine/types.ts:107` (createInitialState default)
- Modify: `engine-rs/src/types.rs:48-57` (RuleSet struct)
- Modify: `src/app/store.ts:42` (initialAppState)
- Modify: 17 TS files with explicit RuleSet literals (48 occurrences)
- Modify: `engine-rs/src/solver.rs` (4 explicit RuleSet literals)
- Modify: `engine-rs/tests/board_fixtures.rs:144-151` (1 explicit RuleSet literal)

- [ ] **Step 1: Add `order` to the TS `RuleSet` interface**

In `src/engine/types.ts`, add `order` as the last field:

```typescript
export interface RuleSet {
  readonly plus: boolean;
  readonly same: boolean;
  readonly reverse: boolean;
  readonly fallenAce: boolean;
  readonly ascension: boolean;
  readonly descension: boolean;
  readonly order: boolean;
}
```

And update the default parameter in `createInitialState`:

```typescript
export function createInitialState(
  playerHand: readonly Card[],
  opponentHand: readonly Card[],
  firstTurn: Owner = Owner.Player,
  rules: RuleSet = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false },
): GameState {
```

- [ ] **Step 2: Add `order` to the Rust `RuleSet` struct**

In `engine-rs/src/types.rs`, add `order` as the last field:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleSet {
    pub plus: bool,
    pub same: bool,
    pub reverse: bool,
    pub fallen_ace: bool,
    pub ascension: bool,
    pub descension: bool,
    pub order: bool,
}
```

Since `RuleSet` derives `Default`, all `RuleSet::default()` and `..RuleSet::default()` usages automatically get `order: false`.

- [ ] **Step 3: Fix all TS compiler errors**

Run `bunx tsc --noEmit` to find all sites missing `order`. Add `order: false` to every explicit RuleSet literal. The pattern is: find `descension: false` or `descension: true` at the end of a RuleSet literal and append `, order: false`.

Key locations (the compiler will find all of them):

| File | Occurrences |
|------|-------------|
| `src/app/store.ts` | 1 (initialAppState) |
| `scripts/generate-board-fixtures.ts` | 3 (noRules, and 2 others if not spread) |
| `tests/engine/board.test.ts` | 21 |
| `tests/engine/solver.wasm.test.ts` | 3 |
| `tests/app/components/HandPanel.test.ts` | 4 |
| `tests/app/store.test.ts` | 4 |
| various other test files | ~12 |

Run: `bunx tsc --noEmit`
Expected: 0 errors after all fixes.

- [ ] **Step 4: Fix all Rust compiler errors**

Run `cargo build --manifest-path engine-rs/Cargo.toml` to find explicit RuleSet constructions missing `order`.

Fix the 4 explicit constructions in `engine-rs/src/solver.rs` (lines ~1078, 1113, 1140, 1182) by adding `order: false`:

```rust
let rules = RuleSet { plus: true, same: false, reverse: false,
    fallen_ace: false, ascension: false, descension: false, order: false };
```

Fix the 1 explicit construction in `engine-rs/tests/board_fixtures.rs` (line ~144):

```rust
let no_rules = RuleSet {
    plus: false,
    same: false,
    reverse: false,
    fallen_ace: false,
    ascension: false,
    descension: false,
    order: false,
};
```

Run: `cargo build --features server --manifest-path engine-rs/Cargo.toml`
Expected: compiles successfully.

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `bun test tests/engine && cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```
git add -A && git commit -m 'feat(ENG-33): add order field to RuleSet (TS + Rust)'
```

---

### Task 2: TS board Order validation (TDD)

**Files:**
- Test: `tests/engine/board.test.ts`
- Modify: `src/engine/board.ts:142-161`

- [ ] **Step 1: Write failing tests for Order rule validation**

Add a new `describe("Order rule")` block in `tests/engine/board.test.ts`:

```typescript
describe("Order rule", () => {
  const orderRules: RuleSet = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: true };

  it("allows placing card at index 0 of the hand", () => {
    resetCardIds();
    const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const state = createInitialState(p, o, Owner.Player, orderRules);

    // p[0] is at index 0 — should succeed
    const result = placeCard(state, p[0]!, 4);
    expect(result.board[4]).toEqual({ card: p[0], owner: Owner.Player });
    expect(result.playerHand).toEqual([p[1], p[2], p[3], p[4]]);
    expect(result.currentTurn).toBe(Owner.Opponent);
  });

  it("throws when playing a card not at index 0", () => {
    resetCardIds();
    const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const state = createInitialState(p, o, Owner.Player, orderRules);

    // p[1] is at index 1, not 0 — should throw
    expect(() => placeCard(state, p[1]!, 4)).toThrow("Order rule");
  });

  it("applies captures normally with Order active", () => {
    resetCardIds();
    // Player's first card has high left value, opponent card already on board to the left
    const p = [createCard(1, 1, 1, 9), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const state = createInitialState(p, o, Owner.Player, orderRules);
    // Place opponent card at position 3 first
    const afterOpp = placeCard(state, o[0]!, 3);
    // Now it's player's turn — afterOpp has o[1] at index 0 of opponent hand... wait, we need player's turn
    // Let's set up differently: opponent goes first
    const stateOppFirst = createInitialState(p, o, Owner.Opponent, orderRules);
    const afterOppPlace = placeCard(stateOppFirst, o[0]!, 3);
    // Now player's turn, p[0] has left=9, placing at position 4 attacks position 3's right=2
    // 9 > 2 → capture
    const result = placeCard(afterOppPlace, p[0]!, 4);
    expect(result.board[3]!.owner).toBe(Owner.Player); // captured
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/engine/board.test.ts`
Expected: "Order rule" tests fail (no validation logic yet, so "throws when playing a card not at index 0" fails because no error is thrown).

- [ ] **Step 3: Implement Order validation in `placeCard`**

In `src/engine/board.ts`, add the Order check after finding the card in hand (after line 161):

```typescript
  const cardIndex = hand.indexOf(card);
  if (cardIndex === -1) {
    throw new Error("Card is not in the current player's hand");
  }

  if (state.rules.order && cardIndex !== 0) {
    throw new Error("Order rule: must play the first card in hand");
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/engine/board.test.ts`
Expected: all tests pass, including the new Order rule tests.

- [ ] **Step 5: Commit**

```
git add tests/engine/board.test.ts src/engine/board.ts && git commit -m 'feat(ENG-33): enforce Order rule in TS placeCard'
```

---

### Task 3: Shared board fixtures for Order rule

**Files:**
- Modify: `scripts/generate-board-fixtures.ts`
- Create: `tests/fixtures/board/order_*.json` (generated)

- [ ] **Step 1: Add Order fixtures to the generator**

Add the following at the end of `scripts/generate-board-fixtures.ts`, before any final newline:

```typescript
// --- Order rule ---
const orderRules: RuleSet = { ...noRules, order: true };

// N. order_basic_placement (card at index 0 placed successfully, no captures)
resetCardIds();
{
  const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
  const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
  const state = createInitialState(p, o, Owner.Player, orderRules);
  writeFixture("order_basic_placement", state, p[0]!.id, 4);
}

// N+1. order_with_standard_capture (Order + normal capture)
resetCardIds();
{
  const pCard = createCard(1, 1, 1, 9);
  const filler = createCard(1, 1, 1, 1);
  const oWeak = createCard(2, 2, 2, 2);
  const oFiller = createCard(3, 3, 3, 3);
  const p = [pCard, filler, filler, filler, filler];
  const o = [oWeak, oFiller, filler, filler, filler];
  // Opponent goes first, places weak card at position 3
  const stateOppFirst = createInitialState(p, o, Owner.Opponent, orderRules);
  const afterOpp = setup(stateOppFirst, [[oWeak, 3]]);
  // Player plays p[0] (left=9) at position 4. Attacks position 3's right=2. 9>2 → capture.
  writeFixture("order_with_standard_capture", afterOpp, pCard.id, 4);
}

// N+2. order_with_plus (Order + Plus rule active)
resetCardIds();
{
  const orderPlusRules: RuleSet = { ...noRules, order: true, plus: true };
  const oCard1 = createCard(1, 1, 5, 1);
  const oCard2 = createCard(1, 7, 1, 1);
  const pCard = createCard(3, 1, 1, 1);
  const filler = createCard(1, 1, 1, 1);
  const p = [pCard, filler, filler, filler, filler];
  const o = [oCard1, oCard2, filler, filler, filler];
  const state = setup(
    createInitialState(p, o, Owner.Player, orderPlusRules),
    [[filler, 8], [oCard1, 1], [filler, 6], [oCard2, 3]],
  );
  // pCard is now at index 0 of remaining player hand. Place at position 4.
  // top(3)+bottom(5)=8, left(1)+right(7)=8 → Plus triggers on both.
  writeFixture("order_with_plus", state, pCard.id, 4);
}
```

- [ ] **Step 2: Regenerate fixtures**

Run: `bun run scripts/generate-board-fixtures.ts`
Expected: New `order_*.json` files generated without errors.

- [ ] **Step 3: Run TS fixture tests**

Run: `bun test tests/engine/board.fixtures.test.ts`
Expected: all fixtures pass (including new order ones).

- [ ] **Step 4: Commit**

```
git add scripts/generate-board-fixtures.ts tests/fixtures/board/order_*.json && git commit -m 'test(ENG-33): add shared board fixtures for Order rule'
```

---

### Task 4: Rust board Order validation

**Files:**
- Modify: `engine-rs/src/board.rs:194-206` (`place_card`)
- Modify: `engine-rs/src/board.rs:344-357` (`place_card_mut`)
- Test: `engine-rs/tests/board_fixtures.rs` (auto-picks up new fixtures)
- Test: `engine-rs/src/board.rs` tests module

- [ ] **Step 1: Write failing Rust unit test for Order rejection**

Add to the `tests` module at the bottom of `engine-rs/src/board.rs`:

```rust
#[test]
#[should_panic(expected = "Order rule")]
fn order_rule_rejects_non_first_card() {
    reset_card_ids();
    let rules = RuleSet { order: true, ..RuleSet::default() };
    let p = vec![
        create_card(7, 3, 5, 2, CardType::None),
        create_card(4, 8, 1, 6, CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
    ];
    let o = vec![
        create_card(2,2,2,2,CardType::None),
        create_card(3,3,3,3,CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
    ];
    let state = create_initial_state(p.clone(), o, Owner::Player, rules);
    // Try to play p[1] (index 1) instead of p[0] — should panic
    place_card(&state, p[1], 4);
}

#[test]
#[should_panic(expected = "Order rule")]
fn order_rule_rejects_non_first_card_mut() {
    reset_card_ids();
    let rules = RuleSet { order: true, ..RuleSet::default() };
    let p = vec![
        create_card(7, 3, 5, 2, CardType::None),
        create_card(4, 8, 1, 6, CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
    ];
    let o = vec![
        create_card(2,2,2,2,CardType::None),
        create_card(3,3,3,3,CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
    ];
    let mut state = create_initial_state(p.clone(), o, Owner::Player, rules);
    place_card_mut(&mut state, p[1], 4);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path engine-rs/Cargo.toml order_rule_rejects`
Expected: FAIL — no panic occurs (validation not yet implemented).

- [ ] **Step 3: Implement Order validation in `place_card`**

In `engine-rs/src/board.rs`, add the check after finding `card_index` (after line ~206):

```rust
    let card_index = hand
        .iter()
        .position(|c| c.id == card.id)
        .expect("Card is not in the current player's hand");

    assert!(
        !state.rules.order || card_index == 0,
        "Order rule: must play the first card in hand"
    );
```

- [ ] **Step 4: Implement Order validation in `place_card_mut`**

In `engine-rs/src/board.rs`, add the same check after finding `card_hand_index` (after line ~357):

```rust
    let card_hand_index = hand
        .iter()
        .position(|c| c.id == card.id)
        .expect("Card is not in the current player's hand");

    assert!(
        !state.rules.order || card_hand_index == 0,
        "Order rule: must play the first card in hand"
    );
```

- [ ] **Step 5: Run Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: all tests pass, including the new `order_rule_rejects_*` tests and the shared board fixtures.

- [ ] **Step 6: Commit**

```
git add engine-rs/src/board.rs && git commit -m 'feat(ENG-33): enforce Order rule in Rust place_card and place_card_mut'
```

---

### Task 5: Rust solver — restrict move enumeration under Order

**Files:**
- Modify: `engine-rs/src/solver.rs:130-157` (negamax card loop)
- Modify: `engine-rs/src/solver.rs:197-218` (find_best_move_with first pass)
- Modify: `engine-rs/src/solver.rs:228-254` (find_best_move_with robustness pass)
- Test: `engine-rs/src/solver.rs` tests module

- [ ] **Step 1: Write failing test — solver only returns moves for card at index 0**

Add to the `tests` module in `engine-rs/src/solver.rs`:

```rust
#[test]
fn solver_order_rule_only_uses_first_card() {
    reset_card_ids();
    let rules = RuleSet { order: true, ..RuleSet::default() };
    let p = vec![
        create_card(3, 3, 3, 3, CardType::None),  // index 0: weak
        create_card(10, 10, 10, 10, CardType::None), // index 1: strong (but forbidden)
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
        create_card(1,1,1,1,CardType::None),
    ];
    let o = vec![
        create_card(5, 5, 5, 5, CardType::None),
        create_card(5, 5, 5, 5, CardType::None),
        create_card(5, 5, 5, 5, CardType::None),
        create_card(5, 5, 5, 5, CardType::None),
        create_card(5, 5, 5, 5, CardType::None),
    ];
    let state = create_initial_state(p.clone(), o, Owner::Player, rules);
    let moves = find_best_move(&state);
    // Every returned move must use p[0] (the 3,3,3,3 card)
    assert!(!moves.is_empty());
    for m in &moves {
        assert_eq!(m.card.id, p[0].id,
            "Order rule: solver suggested card id {} but only card id {} (index 0) is legal",
            m.card.id, p[0].id);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path engine-rs/Cargo.toml solver_order_rule_only_uses_first_card`
Expected: FAIL — solver panics in `place_card_mut` because it tries non-index-0 cards.

- [ ] **Step 3: Restrict `negamax` card loop**

In `engine-rs/src/solver.rs`, replace the card iteration in `negamax` (lines ~134-157):

```rust
    let hand_cards: Vec<Card> = if state.current_turn == Owner::Player {
        state.player_hand.clone()
    } else {
        state.opponent_hand.clone()
    };

    // Order rule: only the first card in hand is legal.
    let cards_to_try: &[Card] = if state.rules.order {
        &hand_cards[..1]
    } else {
        &hand_cards
    };

    let mut seen_cards: HashSet<u32> = HashSet::new();

    'outer: for card in cards_to_try.iter() {
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
```

- [ ] **Step 4: Restrict `find_best_move_with` first pass**

In `engine-rs/src/solver.rs`, replace the card iteration in the first pass (lines ~197-218):

```rust
    let hand_cards: Vec<Card> = if state.current_turn == Owner::Player {
        state.player_hand.clone()
    } else {
        state.opponent_hand.clone()
    };

    // First pass: evaluate all moves with negamax
    let mut evaluated: Vec<(Card, usize, i32)> = Vec::new();
    let mut seen_cards: HashSet<u32> = HashSet::new();

    // Order rule: only the first card in hand is legal.
    let cards_to_try: &[Card] = if state.rules.order {
        &hand_cards[..1]
    } else {
        &hand_cards
    };

    for card in cards_to_try.iter() {
        let ck = stats_key(card);
        if !seen_cards.insert(ck) { continue; }

        for i in 0..9usize {
            if state.board[i].is_some() { continue; }
            let undo = place_card_mut(state, *card, i);
            let value = -negamax(state, NEG_INF, POS_INF, tt, occupied);
            undo_place(state, undo);
            evaluated.push((*card, i, value));
        }
    }
```

- [ ] **Step 5: Restrict `find_best_move_with` robustness pass**

In the robustness pass (lines ~228-254), restrict opponent response enumeration under Order:

```rust
            // Clone opponent hand before inner loop to avoid borrow conflicts
            let opp_hand: Vec<Card> = if state.current_turn == Owner::Player {
                state.player_hand.clone()
            } else {
                state.opponent_hand.clone()
            };

            // Order rule: opponent can only play their first card.
            let opp_cards_to_try: &[Card] = if state.rules.order {
                &opp_hand[..1]
            } else {
                &opp_hand
            };

            let mut total_responses: u32 = 0;
            let mut better_outcome_count: u32 = 0;

            for opp_card in opp_cards_to_try.iter() {
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: all tests pass.

- [ ] **Step 7: Add self-play verification test for Order rule**

Add to the `tests` module in `engine-rs/src/solver.rs`:

```rust
#[test]
fn solver_order_self_play_score_matches_prediction() {
    reset_card_ids();
    let rules = RuleSet { order: true, ..RuleSet::default() };
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
    let state = create_initial_state(p, o, Owner::Player, rules);

    let mut solver = Solver::new();
    let predicted_score = solver.solve(&state)[0].score;

    let mut cur = state;
    loop {
        let moves = solver.solve(&cur);
        if moves.is_empty() { break; }
        cur = place_card(&cur, moves[0].card, moves[0].position as usize);
    }

    let (player_score, _) = get_score(&cur);
    assert_eq!(player_score as u8, predicted_score,
        "Order self-play score {} differs from prediction {}", player_score, predicted_score);
}
```

- [ ] **Step 8: Run all Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: all pass.

- [ ] **Step 9: Commit**

```
git add engine-rs/src/solver.rs && git commit -m 'feat(ENG-33): restrict solver move enumeration under Order rule'
```

---

### Task 6: UI — RulesetInput, store auto-select, HandPanel

**Files:**
- Modify: `src/app/components/setup/RulesetInput.svelte`
- Modify: `src/app/store.ts:259-271` (currentState subscription)
- Modify: `src/app/components/game/HandPanel.svelte`
- Test: `tests/app/components/HandPanel.test.ts`
- Test: `tests/app/store.test.ts`

- [ ] **Step 1: Add Order checkbox to RulesetInput**

In `src/app/components/setup/RulesetInput.svelte`, update the `updateRules` function and add the checkbox.

Add `order` to the local state:

```typescript
let order = $state($game.ruleset.order);
```

Update `updateRules`:

```typescript
function updateRules() {
  updateRuleset({ plus, same, reverse, fallenAce, ascension, descension, order });
}
```

Add the checkbox after the Descension label (before the Swap label):

```svelte
<label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
  <input type="checkbox" bind:checked={
    () => order,
    ruleChanged((v) => order = v)
  } class="accent-accent-blue" />
  Order
</label>
```

- [ ] **Step 2: Add auto-select logic to store**

In `src/app/store.ts`, modify the `currentState.subscribe` callback (lines ~259-271) to auto-select the forced card under Order rule:

```typescript
currentState.subscribe((state) => {
  if (state) {
    if (state === lastSolvedState) return;
    lastSolvedState = state;
    triggerSolve(state);
    // Order rule: auto-select the forced (index 0) card for the current player.
    const g = get(game);
    if (g.ruleset.order) {
      const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;
      if (hand.length > 0 && !g.unknownCardIds.has(hand[0]!.id)) {
        selectCard(hand[0]!);
      }
    }
  } else {
    lastSolvedState = null;
    rankedMoves.set([]);
    solverLoading.set(false);
    pimcProgress.set(null);
  }
});
```

- [ ] **Step 3: Update HandPanel to dim non-forced cards under Order**

In `src/app/components/game/HandPanel.svelte`, add Order-aware logic:

Add an `isOrderActive` derived and a `forcedCard` derived:

```typescript
let isOrderActive = $derived($game.ruleset.order);
let forcedCard = $derived(isOrderActive && isActive ? hand[0] ?? null : null);
```

Update the button class to dim non-forced cards:

```svelte
{#each hand as card, i}
  {@const isUnknown = $game.unknownCardIds.has(card.id)}
  {@const isForced = forcedCard !== null && card === forcedCard}
  {@const isDimmed = isOrderActive && isActive && !isForced}
  <RevealableCard revealing={revealingCardId === card.id} onreveal={handleReveal}>
    <button
      onclick={() => handleClick(card)}
      class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3
        {isActive && !isDimmed ? 'cursor-pointer hover:border-accent-blue' : 'cursor-default opacity-70'}
        {card === $game.selectedCard ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}
        {bestCard && card.id === bestCard.id && isActive ? 'ring-2 ring-accent-gold shadow-lg shadow-accent-gold/20' : ''}
        {isUnknown ? 'border-dashed' : ''}"
    >
      <CardFace {card} unknown={isUnknown} modifier={cardModifier(card.type, $currentState, $game.ruleset)} />
    </button>
  </RevealableCard>
{/each}
```

Update `handleClick` to skip dimmed cards:

```typescript
function handleClick(card: Card) {
  if (!isActive) return;
  if (isOrderActive && hand.indexOf(card) !== 0) return;
  if ($game.unknownCardIds.has(card.id)) {
    revealingCardId = card.id;
    return;
  }
  selectCard(card);
}
```

- [ ] **Step 4: Run UI tests**

Run: `bunx vitest run`
Expected: existing UI tests pass. Some tests may need `order: false` added to RuleSet literals — these should have been caught in Task 1. If any new failures appear, fix them.

- [ ] **Step 5: Commit**

```
git add src/app/components/setup/RulesetInput.svelte src/app/store.ts src/app/components/game/HandPanel.svelte && git commit -m 'feat(ENG-33): add Order rule UI — checkbox, auto-select, hand dimming'
```

---

### Task 7: Full integration test pass

**Files:** None (verification only)

- [ ] **Step 1: Run all TS tests**

Run: `bun test tests/engine && bunx vitest run`
Expected: all pass.

- [ ] **Step 2: Run all Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: all pass.

- [ ] **Step 3: Type check**

Run: `bunx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Run E2E tests (if WASM is pre-built)**

Run: `bun run test:e2e`
Expected: all pass (E2E tests don't exercise Order rule directly, but should not regress).

- [ ] **Step 5: Commit any remaining fixes**

If any tests failed and were fixed, commit the fixes.
