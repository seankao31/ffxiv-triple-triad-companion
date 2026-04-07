# Order Rule Design (ENG-33)

Both players must play cards in the order they appear in their hand (index 0 first, then 1, etc.). No choice of which card — only where to place it.

## Type System

New `order: boolean` field in `RuleSet` (both TS and Rust). Defaults to `false`.

**TypeScript** (`src/engine/types.ts`):
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

**Rust** (`engine-rs/src/types.rs`):
```rust
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

## Board Logic (TS + Rust)

`placeCard` validates that the played card is at index 0 of the current player's hand when `rules.order` is true. If the card is not at index 0, throw/panic. No change to capture logic — Order is a move eligibility constraint, not a capture modifier.

The same validation applies to `place_card_mut` in Rust.

## Solver (Rust)

When `rules.order` is true:

- **`negamax`**: Only iterate the first card in the hand (`hand_cards[0]`). Skip the outer card loop entirely. Only iterate empty board positions.
- **`find_best_move_with`**: Same — only evaluate moves with `hand_cards[0]` at each empty position.
- **`seen_cards` deduplication**: Skipped (only one card to consider).

This reduces branching factor from `cards_in_hand x empty_positions` to just `empty_positions` — a significant performance win.

## PIMC

No change needed. PIMC samples unknown card stats into fixed hand positions. The solver respects Order when evaluating sampled hands because the solver checks `rules.order` during move enumeration.

## UI

### RulesetInput.svelte
Add Order checkbox alongside existing rule checkboxes. Order is part of `RuleSet`, so it flows through `updateRuleset()` like Plus, Same, etc.

### HandPanel.svelte
When Order is active and it's the player's turn:
- Auto-select the card at index 0 (no click required).
- Dim/disable all other cards visually (reduced opacity, no click handler).

### Store (store.ts)
Auto-selection logic: when phase is `play`, Order is active, and it's the player's turn, call `selectCard(playerHand[0])` automatically. This triggers on turn start / after opponent moves.

## Swap Interaction

Order applies to the post-swap hand as-is. The swapped-in card occupies the position of the given card. No reordering after swap. Play proceeds from index 0 of the resulting hand.

## Test Fixtures

Shared board fixtures (`tests/fixtures/board/`) for cross-engine verification:
- Placing the correct (index 0) card succeeds and applies normal capture rules.
- Placing a non-index-0 card is rejected (error/panic).
- Order + capture rules (Plus, Same, etc.) compose correctly.
- Order + Swap: post-swap hand order is respected.

## Files to Modify

| File | Change |
|------|--------|
| `src/engine/types.ts` | Add `order: boolean` to `RuleSet` |
| `engine-rs/src/types.rs` | Add `order: bool` to `RuleSet` |
| `src/engine/board.ts` | Validate index-0 constraint in `placeCard` |
| `engine-rs/src/board.rs` | Validate index-0 constraint in `place_card` and `place_card_mut` |
| `engine-rs/src/solver.rs` | Restrict move enumeration to first card when Order active |
| `src/app/components/setup/RulesetInput.svelte` | Add Order checkbox |
| `src/app/components/game/HandPanel.svelte` | Auto-select forced card, dim others |
| `src/app/store.ts` | Auto-selection logic on turn start |
| `scripts/generate-board-fixtures.ts` | Add Order rule test scenarios |
| `tests/fixtures/board/` | Generated fixture JSON files |
| `tests/engine/board.test.ts` | TS-side Order tests |
| `engine-rs/tests/board_fixtures.rs` | Rust fixture runner picks up new fixtures |
