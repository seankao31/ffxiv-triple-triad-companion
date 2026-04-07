# Chaos Rule Design (ENG-34)

## Summary

Implement the Chaos rule for Triple Triad. At the start of each turn in FFXIV, the game randomly
assigns a card from the active player's hand — that card must be played and the player only chooses
where to place it. Our companion app lets the user input which card was forced, then calculates the
best board position for that card.

## Type & State Changes

### RuleSet

Add `chaos: boolean` to both TypeScript (`src/engine/types.ts`) and Rust (`engine-rs/src/types.rs`)
`RuleSet`. Chaos and Order are mutually exclusive — enforced at the UI layer (enabling one disables
the other).

### GameState

Add `forcedCardId: number | null` (TS) / `forced_card_id: Option<u8>` (Rust) to `GameState`.

- When Chaos is active and it's the player's turn, holds the card ID the user identified as forced.
- `null` when: Chaos is not active, it's the opponent's turn, or no forced card has been selected
  yet.
- `createInitialState` defaults `forcedCardId` to `null`.

## Engine Validation (board.ts / board.rs)

In `placeCard`, add a check adjacent to the existing Order rule check:

```
if rules.chaos && forcedCardId is set && card.id != forcedCardId:
  error "Chaos rule: must play the forced card"
```

- When `forcedCardId` is `null`, no constraint — any card is legal. This covers opponent turns and
  the solver exploring future turns in the search tree.
- When `forcedCardId` is set, only that specific card can be played.
- Chaos and Order are mutually exclusive, so no interaction to handle.
- Captures, stat mods, and combos work identically after placement — Chaos only constrains which
  card is played, not how it resolves.

## Solver Changes (solver.rs)

The solver enumerates legal cards in two places:

1. **`find_best_move_with`** (top-level move ranking): if `forced_card_id` is `Some(id)`, filter
   `hand_cards` to just that card. Otherwise full hand.
2. **`negamax`** (recursive search): always use full hand. The forced card is a current-turn-only
   constraint — the solver doesn't know what future turns will force, so it searches all cards at
   depth > 0.

Robustness calculation (second pass) also uses the full opponent hand regardless of Chaos, since we
don't know the opponent's forced card.

## UI Changes

### Setup (RulesetInput.svelte)

- Add Chaos checkbox.
- Mutual exclusivity: enabling Chaos disables Order and vice versa.

### Game Store (store.ts)

- When Chaos is active and it's the player's turn, the solver does not run until the user selects
  the forced card.
- User selects a card from hand → store sets `forcedCardId` on the GameState → state change triggers
  solver → solver returns ranked positions for that one card.
- On opponent turns, `forcedCardId` stays `null` — no special handling, user inputs opponent's move
  as normal.
- On undo, `forcedCardId` resets to `null` so the user can re-select.

### Display (ActiveRules.svelte)

Add "Chaos" to the rule label map.

## Cross-Engine Alignment

Both TS and Rust engines must be updated and verified against shared board fixtures.

### Shared Board Fixtures

Add to `scripts/generate-board-fixtures.ts`:

1. Forced card played with Chaos active → captures resolve normally (proves Chaos doesn't interfere
   with capture mechanics).
2. Non-forced card played with Chaos active → error (proves validation works).

Both engines consume the same fixtures via `tests/fixtures/board/`.

## Scope Summary

| Layer | Change |
|-------|--------|
| Types (TS + Rust) | `chaos` on RuleSet, `forcedCardId` on GameState |
| Engine (TS + Rust) | Validate forced card in `placeCard` |
| Solver (Rust) | Constrain `cards_to_try` at depth 0 when `forced_card_id` is set |
| UI — Setup | Chaos checkbox, mutual exclusivity with Order |
| UI — Game | Wait for forced card selection before solving (player turn only) |
| UI — Display | "Chaos" in ActiveRules |
| Fixtures | Shared board fixtures for Chaos validation |

## Out of Scope

- Pre-determining forced cards for future turns (solver searches full hand at depth > 0)
- Opponent forced card tracking (we don't know what FFXIV forced on them)
- PIMC/WASM changes (Chaos doesn't affect simulation sampling — `forcedCardId` is `null` in sim
  turns)
