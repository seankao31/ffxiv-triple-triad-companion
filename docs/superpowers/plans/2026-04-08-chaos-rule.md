# Chaos Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Chaos rule — a card-selection constraint where the user inputs which card FFXIV forced, and the solver finds the best board position for that card.

**Architecture:** Add `chaos: boolean` to RuleSet and `forcedCardId: number | null` to GameState in both TS and Rust engines. Engine validates forced card at placement. Solver constrains move enumeration at depth 0 only. UI adds checkbox with Order mutual exclusivity and gates solving on forced-card selection.

**Tech Stack:** TypeScript (board.ts, types.ts, store.ts), Rust (types.rs, board.rs, solver.rs), Svelte 5 (RulesetInput, ActiveRules), Bun test runner, Cargo test

---

### Task 1: Add `chaos` to RuleSet and `forcedCardId` to GameState (TypeScript)

**Files:**
- Modify: `src/engine/types.ts:49-57` (RuleSet interface)
- Modify: `src/engine/types.ts:59-65` (GameState interface)
- Modify: `src/engine/types.ts:104-117` (createInitialState)

- [ ] **Step 1: Add `chaos` to the RuleSet interface**

In `src/engine/types.ts`, add `chaos` after `order` in the `RuleSet` interface:

```typescript
export interface RuleSet {
  readonly plus: boolean;
  readonly same: boolean;
  readonly reverse: boolean;
  readonly fallenAce: boolean;
  readonly ascension: boolean;
  readonly descension: boolean;
  readonly order: boolean;
  readonly chaos: boolean;
}
```

- [ ] **Step 2: Add `forcedCardId` to the GameState interface**

In `src/engine/types.ts`, add `forcedCardId` after `rules` in the `GameState` interface:

```typescript
export interface GameState {
  readonly board: Board;
  readonly playerHand: readonly Card[];
  readonly opponentHand: readonly Card[];
  readonly currentTurn: Owner;
  readonly rules: RuleSet;
  readonly forcedCardId: number | null;
}
```

- [ ] **Step 3: Update `createInitialState` default and return value**

Update the default `rules` parameter to include `chaos: false` and add `forcedCardId: null` to the return:

```typescript
export function createInitialState(
  playerHand: readonly Card[],
  opponentHand: readonly Card[],
  firstTurn: Owner = Owner.Player,
  rules: RuleSet = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
): GameState {
  return {
    board: [null, null, null, null, null, null, null, null, null],
    playerHand,
    opponentHand,
    currentTurn: firstTurn,
    rules,
    forcedCardId: null,
  };
}
```

- [ ] **Step 4: Update `placeCard` return to include `forcedCardId: null`**

In `src/engine/board.ts:206-214`, add `forcedCardId: null` to the returned state. The next turn's forced card is unknown, so it always resets:

```typescript
  return {
    board: newBoard as Board,
    playerHand:
      state.currentTurn === Owner.Player ? newHand : state.playerHand,
    opponentHand:
      state.currentTurn === Owner.Opponent ? newHand : state.opponentHand,
    currentTurn: nextTurn,
    rules: state.rules,
    forcedCardId: null,
  };
```

- [ ] **Step 5: Fix all TypeScript compilation errors**

Run `bunx tsc --noEmit` and fix every site that constructs a `RuleSet` or `GameState` without the new fields. These will be in test files (e.g. `tests/engine/board.test.ts`, `tests/app/store.test.ts`, `tests/app/components/ActiveRules.test.ts`) and `scripts/generate-board-fixtures.ts`. Add `chaos: false` to every RuleSet literal and `forcedCardId: null` to every GameState literal.

Key files to update:
- `tests/engine/board.test.ts` — every `RuleSet` literal (search for `order: false` and `order: true`)
- `tests/app/store.test.ts` — every `ruleset:` literal
- `tests/app/components/ActiveRules.test.ts` — the `setRules` helper's ruleset object
- `scripts/generate-board-fixtures.ts` — `noRules` constant and all RuleSet spreads
- `src/app/store.ts` — `initialAppState.ruleset`, `updateRuleset`, `startGame`

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Run tests to verify nothing breaks**

Run: `bun test tests/engine`
Expected: 96 pass (WASM test still expected to fail — pkg not built).

Run: `bunx vitest run`
Expected: 204+ pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/board.ts src/app/store.ts tests/ scripts/generate-board-fixtures.ts
git commit -m 'feat(ENG-34): add chaos to RuleSet and forcedCardId to GameState (TS)'
```

---

### Task 2: Add Chaos validation to TS engine

**Files:**
- Modify: `src/engine/board.ts:163-165` (placeCard validation)
- Modify: `tests/engine/board.test.ts` (new describe block)

- [ ] **Step 1: Write failing tests for Chaos validation**

In `tests/engine/board.test.ts`, add a new `describe("Chaos rule", ...)` block after the Order rule block (after line 1145):

```typescript
describe("Chaos rule", () => {
  const chaosRules: RuleSet = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: true };

  it("allows placing the forced card", () => {
    resetCardIds();
    const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const state: GameState = { ...createInitialState(p, o, Owner.Player, chaosRules), forcedCardId: p[0]!.id };

    const result = placeCard(state, p[0]!, 4);
    expect(result.board[4]).toEqual({ card: p[0]!, owner: Owner.Player });
    expect(result.forcedCardId).toBeNull();
  });

  it("throws when playing a card that is not the forced card", () => {
    resetCardIds();
    const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const state: GameState = { ...createInitialState(p, o, Owner.Player, chaosRules), forcedCardId: p[0]!.id };

    expect(() => placeCard(state, p[1]!, 4)).toThrow("Chaos rule");
  });

  it("allows any card when forcedCardId is null (opponent turn / future turn)", () => {
    resetCardIds();
    const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const state = createInitialState(p, o, Owner.Player, chaosRules);
    // forcedCardId is null — any card should be allowed
    const result = placeCard(state, p[1]!, 4);
    expect(result.board[4]).toEqual({ card: p[1]!, owner: Owner.Player });
  });

  it("applies captures normally with Chaos active", () => {
    resetCardIds();
    const p = [createCard(1, 1, 1, 9), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const stateOppFirst = createInitialState(p, o, Owner.Opponent, chaosRules);
    const afterOppPlace = placeCard(stateOppFirst, o[0]!, 3);
    // Player's turn, forced to play p[0]. left=9, placing at 4 attacks position 3's right=2. 9>2 → capture.
    const state: GameState = { ...afterOppPlace, forcedCardId: p[0]!.id };
    const result = placeCard(state, p[0]!, 4);
    expect(result.board[3]!.owner).toBe(Owner.Player);
  });

  it("clears forcedCardId in the resulting state", () => {
    resetCardIds();
    const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
    const state: GameState = { ...createInitialState(p, o, Owner.Player, chaosRules), forcedCardId: p[0]!.id };

    const result = placeCard(state, p[0]!, 4);
    expect(result.forcedCardId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/engine/board.test.ts`
Expected: The "throws when playing a card that is not the forced card" test FAILS (no validation yet). Others may pass since `forcedCardId: null` returns naturally.

- [ ] **Step 3: Add Chaos validation to placeCard**

In `src/engine/board.ts`, after the Order rule check (line 165), add:

```typescript
  if (state.rules.chaos && state.forcedCardId !== null && card.id !== state.forcedCardId) {
    throw new Error("Chaos rule: must play the forced card");
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/engine/board.test.ts`
Expected: All tests pass, including the new Chaos tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/board.ts tests/engine/board.test.ts
git commit -m 'feat(ENG-34): add Chaos rule validation to TS engine'
```

---

### Task 3: Add `chaos` to RuleSet and `forced_card_id` to GameState (Rust)

**Files:**
- Modify: `engine-rs/src/types.rs:48-58` (RuleSet struct)
- Modify: `engine-rs/src/types.rs:60-68` (GameState struct)
- Modify: `engine-rs/src/types.rs:108-121` (create_initial_state)

- [ ] **Step 1: Add `chaos` to RuleSet**

In `engine-rs/src/types.rs`, add `chaos` after `order` in the `RuleSet` struct:

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
    pub chaos: bool,
}
```

Since `RuleSet` derives `Default`, the new `chaos` field defaults to `false` — existing code constructing `RuleSet::default()` is unaffected.

- [ ] **Step 2: Add `forced_card_id` to GameState**

In `engine-rs/src/types.rs`, add `forced_card_id` after `rules` in the `GameState` struct. Use `#[serde(default)]` so existing fixture JSON files (without the field) deserialize correctly:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub board: Board,
    pub player_hand: Vec<Card>,
    pub opponent_hand: Vec<Card>,
    pub current_turn: Owner,
    pub rules: RuleSet,
    #[serde(default)]
    pub forced_card_id: Option<u8>,
}
```

- [ ] **Step 3: Update `create_initial_state` to include `forced_card_id: None`**

```rust
pub fn create_initial_state(
    player_hand: Vec<Card>,
    opponent_hand: Vec<Card>,
    first_turn: Owner,
    rules: RuleSet,
) -> GameState {
    GameState {
        board: [None; 9],
        player_hand,
        opponent_hand,
        current_turn: first_turn,
        rules,
        forced_card_id: None,
    }
}
```

- [ ] **Step 4: Fix compilation errors across Rust codebase**

Run `cargo check --features server --manifest-path engine-rs/Cargo.toml` and fix every site that constructs a `GameState` without `forced_card_id`. Key files:
- `engine-rs/src/board.rs:284-291` — `place_card` return (add `forced_card_id: None`)
- `engine-rs/src/board.rs:352-458` — `place_card_mut` (clear `forced_card_id` to `None` after placement, record in `UndoRecord`)
- `engine-rs/src/board.rs:294-300` — `UndoRecord` (add `forced_card_id: Option<u8>` to save pre-mutation value)
- `engine-rs/src/board.rs` — `undo_place` (restore `forced_card_id` from UndoRecord)
- `engine-rs/tests/board_fixtures.rs:144-163` — RuleSet literals (add `chaos: false`)
- `engine-rs/src/solver.rs` — any RuleSet literals in tests (add `chaos: false`)

For `place_card` return (around line 284):

```rust
    GameState {
        board: new_board,
        player_hand,
        opponent_hand,
        current_turn: next_turn,
        rules: state.rules,
        forced_card_id: None,
    }
```

For `place_card_mut`, save and clear `forced_card_id`:

```rust
    // Save forced_card_id before clearing (for undo)
    let saved_forced_card_id = state.forced_card_id;
    state.forced_card_id = None;
```

Add to `UndoRecord`:

```rust
pub struct UndoRecord {
    card: Card,
    position: usize,
    card_hand_index: usize,
    prev_turn: Owner,
    flipped: Vec<(usize, Owner)>,
    forced_card_id: Option<u8>,
}
```

Update the `UndoRecord` construction at the end of `place_card_mut` to include `forced_card_id: saved_forced_card_id`.

In `undo_place`, restore it:

```rust
    state.forced_card_id = undo.forced_card_id;
```

Run: `cargo check --features server --manifest-path engine-rs/Cargo.toml`
Expected: No errors.

- [ ] **Step 5: Run Rust tests to verify nothing breaks**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: 87 tests pass (same as baseline).

- [ ] **Step 6: Commit**

```bash
git add engine-rs/src/types.rs engine-rs/src/board.rs engine-rs/tests/board_fixtures.rs engine-rs/src/solver.rs
git commit -m 'feat(ENG-34): add chaos to RuleSet and forced_card_id to GameState (Rust)'
```

---

### Task 4: Add Chaos validation to Rust engine

**Files:**
- Modify: `engine-rs/src/board.rs:208-213` (place_card validation)
- Modify: `engine-rs/src/board.rs:366-370` (place_card_mut validation)

- [ ] **Step 1: Add Chaos validation to `place_card`**

In `engine-rs/src/board.rs`, after the Order assert (line 213), add:

```rust
    assert!(
        !state.rules.chaos || state.forced_card_id.is_none() || card.id == state.forced_card_id.unwrap(),
        "Chaos rule: must play the forced card"
    );
```

- [ ] **Step 2: Add Chaos validation to `place_card_mut`**

In `engine-rs/src/board.rs`, after the Order assert in `place_card_mut` (line 370), add the same assert:

```rust
    assert!(
        !state.rules.chaos || state.forced_card_id.is_none() || card.id == state.forced_card_id.unwrap(),
        "Chaos rule: must play the forced card"
    );
```

- [ ] **Step 3: Add Rust unit tests for Chaos validation**

In `engine-rs/src/board.rs`, in the `#[cfg(test)]` module, add:

```rust
    #[test]
    fn chaos_allows_forced_card() {
        reset_card_ids();
        let rules = RuleSet { chaos: true, ..RuleSet::default() };
        let p = vec![
            create_card(7, 3, 5, 2, CardType::None),
            create_card(4, 8, 1, 6, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let o = vec![
            create_card(2, 2, 2, 2, CardType::None),
            create_card(3, 3, 3, 3, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let mut state = create_initial_state(p.clone(), o, Owner::Player, rules);
        state.forced_card_id = Some(p[0].id);
        let result = place_card(&state, p[0], 4);
        assert_eq!(result.board[4].unwrap().card, p[0]);
        assert_eq!(result.forced_card_id, None);
    }

    #[test]
    #[should_panic(expected = "Chaos rule")]
    fn chaos_rejects_non_forced_card() {
        reset_card_ids();
        let rules = RuleSet { chaos: true, ..RuleSet::default() };
        let p = vec![
            create_card(7, 3, 5, 2, CardType::None),
            create_card(4, 8, 1, 6, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let o = vec![
            create_card(2, 2, 2, 2, CardType::None),
            create_card(3, 3, 3, 3, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let mut state = create_initial_state(p.clone(), o, Owner::Player, rules);
        state.forced_card_id = Some(p[0].id);
        let _ = place_card(&state, p[1], 4); // should panic
    }

    #[test]
    fn chaos_allows_any_card_when_forced_card_id_is_none() {
        reset_card_ids();
        let rules = RuleSet { chaos: true, ..RuleSet::default() };
        let p = vec![
            create_card(7, 3, 5, 2, CardType::None),
            create_card(4, 8, 1, 6, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let o = vec![
            create_card(2, 2, 2, 2, CardType::None),
            create_card(3, 3, 3, 3, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let state = create_initial_state(p.clone(), o, Owner::Player, rules);
        // forced_card_id is None — any card is legal
        let result = place_card(&state, p[1], 4);
        assert_eq!(result.board[4].unwrap().card, p[1]);
    }

    #[test]
    fn chaos_place_card_mut_clears_forced_card_id() {
        reset_card_ids();
        let rules = RuleSet { chaos: true, ..RuleSet::default() };
        let p = vec![
            create_card(7, 3, 5, 2, CardType::None),
            create_card(4, 8, 1, 6, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let o = vec![
            create_card(2, 2, 2, 2, CardType::None),
            create_card(3, 3, 3, 3, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
            create_card(1,1,1,1, CardType::None),
        ];
        let mut state = create_initial_state(p.clone(), o, Owner::Player, rules);
        state.forced_card_id = Some(p[0].id);
        let undo = place_card_mut(&mut state, p[0], 4);
        assert_eq!(state.forced_card_id, None);

        // Undo restores forced_card_id
        undo_place(&mut state, undo);
        assert_eq!(state.forced_card_id, Some(p[0].id));
    }
```

- [ ] **Step 4: Run Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: 91+ tests pass (87 baseline + 4 new).

- [ ] **Step 5: Commit**

```bash
git add engine-rs/src/board.rs
git commit -m 'feat(ENG-34): add Chaos rule validation to Rust engine'
```

---

### Task 5: Add shared board fixtures for Chaos

**Files:**
- Modify: `scripts/generate-board-fixtures.ts` (add Chaos fixtures)

- [ ] **Step 1: Add Chaos fixtures to the generator**

In `scripts/generate-board-fixtures.ts`, after the Order rule fixtures (around line 785), add:

```typescript
// --- Chaos rule ---
const chaosRules: RuleSet = { ...noRules, chaos: true };

// 33. chaos_forced_card_placement (forced card placed, standard capture applies)
resetCardIds();
{
  const pCard = createCard(1, 1, 1, 9);
  const oWeak = createCard(2, 2, 2, 2);
  const p = [pCard, createCard(1, 1, 1, 1), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1)];
  const o = [oWeak, createCard(3, 3, 3, 3), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1)];
  const stateOppFirst = createInitialState(p, o, Owner.Opponent, chaosRules);
  const afterOpp = setup(stateOppFirst, [[oWeak, 3]]);
  // Player forced to play pCard (left=9) at position 4. Attacks position 3's right=2. 9>2 → capture.
  const stateWithForced: GameState = { ...afterOpp, forcedCardId: pCard.id };
  writeFixture("chaos_forced_card_placement", stateWithForced, pCard.id, 4);
}

// 34. chaos_no_forced_card_allows_any (forcedCardId=null, Chaos active, any card legal)
resetCardIds();
{
  const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
  const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
  const state = createInitialState(p, o, Owner.Player, chaosRules);
  // forcedCardId is null — second card in hand should be legal
  writeFixture("chaos_no_forced_card_allows_any", state, p[1]!.id, 4);
}
```

- [ ] **Step 2: Regenerate all fixtures**

Run: `bun scripts/generate-board-fixtures.ts`
Expected: All fixtures regenerated (32 existing + 2 new). No errors.

- [ ] **Step 3: Run TS fixture tests**

Run: `bun test tests/engine/board.fixtures.test.ts`
Expected: 34 fixtures pass.

- [ ] **Step 4: Run Rust fixture tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml board_fixtures`
Expected: Both `test_board_fixtures` and `test_board_fixtures_mut_and_undo` pass with 34 fixtures each.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-board-fixtures.ts tests/fixtures/board/
git commit -m 'feat(ENG-34): add shared board fixtures for Chaos rule'
```

---

### Task 6: Constrain solver move enumeration for Chaos

**Files:**
- Modify: `engine-rs/src/solver.rs:140-145` (negamax cards_to_try)
- Modify: `engine-rs/src/solver.rs:214-219` (find_best_move_with cards_to_try)
- Modify: `engine-rs/src/solver.rs:249-252` (robustness cards_to_try)

- [ ] **Step 1: Write failing solver test**

In `engine-rs/src/solver.rs`, in the `#[cfg(test)]` module, add:

```rust
    #[test]
    fn solver_chaos_only_uses_forced_card() {
        reset_card_ids();
        let rules = RuleSet { chaos: true, ..RuleSet::default() };
        let p = vec![
            create_card(3, 3, 3, 3, CardType::None),  // index 0
            create_card(10, 10, 10, 10, CardType::None), // index 1 (forced)
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
        let mut state = create_initial_state(p.clone(), o, Owner::Player, rules);
        state.forced_card_id = Some(p[1].id);
        let moves = find_best_move(&state);
        // Every returned move must use p[1] (the forced card)
        assert!(!moves.is_empty());
        for m in &moves {
            assert_eq!(m.card.id, p[1].id,
                "Chaos rule: solver suggested card id {} but only card id {} is forced",
                m.card.id, p[1].id);
        }
    }

    #[test]
    fn solver_chaos_no_forced_card_uses_all() {
        reset_card_ids();
        let rules = RuleSet { chaos: true, ..RuleSet::default() };
        let p = vec![
            create_card(3, 3, 3, 3, CardType::None),
            create_card(10, 10, 10, 10, CardType::None),
            create_card(7, 7, 7, 7, CardType::None),
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
        // forced_card_id is None — solver should use all cards
        let moves = find_best_move(&state);
        let card_ids: std::collections::HashSet<u8> = moves.iter().map(|m| m.card.id).collect();
        // Should have moves from multiple distinct cards
        assert!(card_ids.len() > 1,
            "Chaos with no forced card should use multiple cards, got {:?}", card_ids);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml solver_chaos`
Expected: `solver_chaos_only_uses_forced_card` FAILS (solver uses all cards, not just forced).

- [ ] **Step 3: Constrain `find_best_move_with` for Chaos**

In `engine-rs/src/solver.rs`, replace the `cards_to_try` logic in `find_best_move_with` (lines 214-219):

```rust
    // Order rule: only the first card in hand is legal.
    // Chaos rule: only the forced card is legal (when set).
    let cards_to_try: Vec<Card> = if state.rules.order {
        vec![hand_cards[0]]
    } else if let Some(forced_id) = state.forced_card_id {
        hand_cards.iter().filter(|c| c.id == forced_id).copied().collect()
    } else {
        hand_cards.clone()
    };
```

Note: This changes `cards_to_try` from `&[Card]` to `Vec<Card>`. Update the `for card in cards_to_try.iter()` loop accordingly (it already iterates by reference, so no change needed to the loop body).

Apply the same change to the robustness second-pass opponent enumeration (around line 249) — but only for the `opp_cards_to_try`. Since the opponent's `forced_card_id` is always `None` during solver evaluation, this won't change behavior, but keep the pattern consistent:

```rust
            // Order rule: opponent can only play their first card.
            let opp_cards_to_try: Vec<Card> = if state.rules.order {
                vec![opp_hand[0]]
            } else {
                opp_hand.clone()
            };
```

(No Chaos branch needed here — opponent forced card is always `None`.)

- [ ] **Step 4: Keep `negamax` unchanged**

In `negamax` (lines 140-145), the `cards_to_try` logic does NOT need a Chaos branch. After `place_card_mut` clears `forced_card_id` to `None`, all recursive calls see `None` and use the full hand. The existing Order check still applies. No changes needed.

Verify this reasoning: `find_best_move_with` calls `place_card_mut` → clears `forced_card_id` → calls `negamax` → `state.forced_card_id` is `None` → tries all cards. Correct.

- [ ] **Step 5: Run solver tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml solver`
Expected: All solver tests pass including the 2 new Chaos tests.

- [ ] **Step 6: Run full Rust test suite**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: 93+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add engine-rs/src/solver.rs
git commit -m 'feat(ENG-34): constrain solver move enumeration for Chaos rule'
```

---

### Task 7: UI — Chaos checkbox with Order mutual exclusivity

**Files:**
- Modify: `src/app/components/setup/RulesetInput.svelte`
- Modify: `tests/app/components/ActiveRules.test.ts`
- Modify: `src/app/components/game/ActiveRules.svelte`
- Modify: `src/app/store.ts` (initialAppState, updateRuleset)

**Note on RulesetInput testing:** This component uses Svelte 5 function bindings (`bind:checked`) for checkbox state. The tests for RulesetInput live in the E2E suite (Playwright), not unit tests. Changes here are tested via E2E in Task 9.

- [ ] **Step 1: Add `chaos` to store's initialAppState and update ruleset references**

In `src/app/store.ts`, update `initialAppState.ruleset` to include `chaos: false`:

```typescript
  ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
```

- [ ] **Step 2: Add Chaos checkbox with mutual exclusivity to RulesetInput**

In `src/app/components/setup/RulesetInput.svelte`:

1. Add `let chaos = $state($game.ruleset.chaos);` after the `order` state declaration.
2. Update `updateRules` to include `chaos`:
   ```typescript
   function updateRules() {
     updateRuleset({ plus, same, reverse, fallenAce, ascension, descension, order, chaos });
   }
   ```
3. Add mutual exclusivity handlers. Replace `ruleChanged` with one that handles the Order/Chaos toggle:
   ```typescript
   function ruleChanged(setter: (v: boolean) => void) {
     return (v: boolean) => { setter(v); updateRules(); };
   }

   function orderChanged(v: boolean) {
     order = v;
     if (v) chaos = false;
     updateRules();
   }

   function chaosChanged(v: boolean) {
     chaos = v;
     if (v) order = false;
     updateRules();
   }
   ```
4. Update the Order checkbox to use `orderChanged`:
   ```svelte
   <input type="checkbox" bind:checked={
     () => order,
     orderChanged
   } class="accent-accent-blue" />
   ```
5. Add the Chaos checkbox after Order:
   ```svelte
   <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
     <input type="checkbox" bind:checked={
       () => chaos,
       chaosChanged
     } class="accent-accent-blue" />
     Chaos
   </label>
   ```

- [ ] **Step 3: Add "Chaos" to ActiveRules label map**

In `src/app/components/game/ActiveRules.svelte`, add `['chaos', 'Chaos']` after the Order entry:

```typescript
  const ruleLabels: [key: keyof RuleSet, label: string][] = [
    ['plus', 'Plus'],
    ['same', 'Same'],
    ['reverse', 'Reverse'],
    ['fallenAce', 'Fallen Ace'],
    ['ascension', 'Ascension'],
    ['descension', 'Descension'],
    ['order', 'Order'],
    ['chaos', 'Chaos'],
  ];
```

- [ ] **Step 4: Add ActiveRules unit test for Chaos**

In `tests/app/components/ActiveRules.test.ts`:

1. Update the `setRules` helper's ruleset to include `chaos`:
   ```typescript
   function setRules(overrides: Partial<{
     plus: boolean; same: boolean; reverse: boolean;
     fallenAce: boolean; ascension: boolean; descension: boolean; order: boolean; chaos: boolean;
     swap: boolean; threeOpen: boolean;
   }> = {}) {
     game.set({
       phase: 'play',
       ruleset: {
         plus: overrides.plus ?? false,
         same: overrides.same ?? false,
         reverse: overrides.reverse ?? false,
         fallenAce: overrides.fallenAce ?? false,
         ascension: overrides.ascension ?? false,
         descension: overrides.descension ?? false,
         order: overrides.order ?? false,
         chaos: overrides.chaos ?? false,
       },
       swap: overrides.swap ?? false,
       threeOpen: overrides.threeOpen ?? false,
       playerHand: [null, null, null, null, null],
       setupPlayerHand: [null, null, null, null, null],
       opponentHand: [null, null, null, null, null],
       firstTurn: Owner.Player,
       history: [],
       selectedCard: null,
       unknownCardIds: new Set(),
     });
   }
   ```

2. Add test:
   ```typescript
   it('renders Chaos when it is the only active rule', () => {
     setRules({ chaos: true });
     render(ActiveRules);
     expect(screen.getByText('Active rules: Chaos')).toBeInTheDocument();
   });
   ```

- [ ] **Step 5: Run UI tests**

Run: `bunx vitest run`
Expected: All tests pass (205+ including new Chaos test).

- [ ] **Step 6: Commit**

```bash
git add src/app/store.ts src/app/components/setup/RulesetInput.svelte src/app/components/game/ActiveRules.svelte tests/app/components/ActiveRules.test.ts
git commit -m 'feat(ENG-34): add Chaos checkbox and ActiveRules label'
```

---

### Task 8: UI — Gate solver on forced card selection

**Files:**
- Modify: `src/app/store.ts:259-281` (currentState subscriber)
- Modify: `src/app/store.ts:415-424` (playCard)
- Modify: `tests/app/store.test.ts` (new tests)

- [ ] **Step 1: Write failing store tests for Chaos solver gating**

In `tests/app/store.test.ts`, add a new `describe('Chaos rule', ...)` block:

```typescript
describe('Chaos rule', () => {
  const chaosRules: RuleSet = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: true };

  function startChaosGame() {
    const cards = [
      [7, 3, 5, 2], [4, 8, 1, 6], [9, 2, 3, 7], [5, 6, 4, 8], [3, 9, 7, 1],
    ] as const;
    const oppCards = [
      [2, 2, 2, 2], [3, 3, 3, 3], [4, 4, 4, 4], [5, 5, 5, 5], [6, 6, 6, 6],
    ] as const;
    for (let i = 0; i < 5; i++) {
      updatePlayerCard(i, createCard(cards[i][0], cards[i][1], cards[i][2], cards[i][3]));
      updateOpponentCard(i, createCard(oppCards[i][0], oppCards[i][1], oppCards[i][2], oppCards[i][3]));
    }
    updateRuleset(chaosRules);
    startGame();
    return get(game);
  }

  it('does not trigger solve when Chaos is active and no forced card is selected (player turn)', () => {
    startChaosGame();
    // Solver should NOT be loading — no forced card selected yet
    expect(get(solverLoading)).toBe(false);
  });

  it('sets forcedCardId on state when selecting a card under Chaos', () => {
    startChaosGame();
    const state = get(currentState)!;
    const hand = state.playerHand;
    selectCard(hand[0]!);
    // After selecting, the current state should have forcedCardId set
    const updatedState = get(currentState)!;
    expect(updatedState.forcedCardId).toBe(hand[0]!.id);
  });

  it('triggers solve after forced card is selected', () => {
    startChaosGame();
    const state = get(currentState)!;
    selectCard(state.playerHand[0]!);
    // Solver should now be loading
    expect(get(solverLoading)).toBe(true);
  });

  it('clears forcedCardId on undo', () => {
    const g = startChaosGame();
    const state = get(currentState)!;
    selectCard(state.playerHand[0]!);
    playCard(4);
    undoMove();
    const afterUndo = get(currentState)!;
    expect(afterUndo.forcedCardId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: Chaos tests FAIL (solver gating not implemented yet).

- [ ] **Step 3: Implement solver gating in the store**

In `src/app/store.ts`, modify the `currentState.subscribe` callback (around line 259):

```typescript
currentState.subscribe((state) => {
  if (state) {
    if (state === lastSolvedState) return;
    lastSolvedState = state;
    // Chaos rule: don't solve until the user selects the forced card (player turn only).
    const g = get(game);
    if (g.ruleset.chaos && state.currentTurn === Owner.Player && state.forcedCardId === null) {
      return;
    }
    triggerSolve(state);
    // Order rule: auto-select the forced (index 0) card for the current player.
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

- [ ] **Step 4: Update `selectCard` to set forcedCardId on state under Chaos**

In `src/app/store.ts`, modify `selectCard`:

```typescript
export function selectCard(card: Card | null): void {
  game.update((s) => {
    const newState = { ...s, selectedCard: card };
    // Chaos rule: selecting a card sets forcedCardId on the current game state (player turn only).
    if (s.ruleset.chaos && card !== null && s.history.length > 0) {
      const currentState = s.history.at(-1)!;
      if (currentState.currentTurn === Owner.Player && currentState.forcedCardId === null) {
        const updatedState: GameState = { ...currentState, forcedCardId: card.id };
        const history = [...s.history.slice(0, -1), updatedState];
        return { ...newState, history };
      }
    }
    return newState;
  });
}
```

This replaces the last history entry with one that has `forcedCardId` set. The `currentState` derived store picks up the change and triggers the subscriber, which now sees `forcedCardId !== null` and calls `triggerSolve`.

- [ ] **Step 5: Ensure undo clears forcedCardId**

The existing `undoMove` pops the last history entry. If the user set `forcedCardId` on the current state and then undoes, the popped state is the one with `forcedCardId` set, and the previous state has `forcedCardId: null` (as set by `placeCard`). So undo naturally clears `forcedCardId`. No additional changes needed.

Verify: the `undoMove` function at line 426-433 slices history to remove the last entry. The entry before it was the result of a `placeCard` call which sets `forcedCardId: null`. Correct.

However, if the user selects a forced card (which mutates the last history entry to set `forcedCardId`) and then wants to change the selection without undoing, we should allow re-selecting. Update `selectCard` to handle this:

```typescript
      if (currentState.currentTurn === Owner.Player) {
        const updatedState: GameState = { ...currentState, forcedCardId: card.id };
        const history = [...s.history.slice(0, -1), updatedState];
        return { ...newState, history };
      }
```

(Remove the `&& currentState.forcedCardId === null` guard so re-selection works.)

- [ ] **Step 6: Run store tests**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All tests pass including new Chaos tests.

- [ ] **Step 7: Run full UI test suite**

Run: `bunx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat(ENG-34): gate solver on forced card selection under Chaos rule'
```

---

### Task 9: Validate mutual exclusivity in startGame

**Files:**
- Modify: `src/app/store.ts:350-408` (startGame validation)
- Modify: `tests/app/store.test.ts`

- [ ] **Step 1: Write failing test for Chaos+Order rejection**

In `tests/app/store.test.ts`, in the Chaos rule describe block:

```typescript
  it('startGame throws when both Chaos and Order are active', () => {
    const bothRules: RuleSet = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: true, chaos: true };
    for (let i = 0; i < 5; i++) {
      updatePlayerCard(i, createCard(i+1, i+1, i+1, i+1));
      updateOpponentCard(i, createCard(i+6, i+6, i+6, i+6));
    }
    updateRuleset(bothRules);
    expect(() => startGame()).toThrow('Chaos and Order');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: FAIL — no validation yet.

- [ ] **Step 3: Add validation to startGame**

In `src/app/store.ts`, in `startGame()`, after the Ascension/Descension check (line 359):

```typescript
  if (s.ruleset.chaos && s.ruleset.order) {
    throw new Error('Chaos and Order cannot both be active.');
  }
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat(ENG-34): validate Chaos/Order mutual exclusivity in startGame'
```

---

### Task 10: Full cross-engine verification

- [ ] **Step 1: Run all TS engine tests**

Run: `bun test tests/engine`
Expected: 96+ pass (WASM test expected to fail — pkg not built).

- [ ] **Step 2: Run all Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml`
Expected: 93+ pass.

- [ ] **Step 3: Run full UI test suite**

Run: `bunx vitest run`
Expected: 205+ pass.

- [ ] **Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit any remaining fixes**

If any tests fail, fix and commit.
