# Fixed Hand Slots Design

**Issue:** ENG-84 — Hand slots are fixed in place — played cards leave an empty gap
**Date:** 2026-04-08

## Problem

When a card is played from hand, the remaining cards shift position because `placeCard()` splices the card out of the hand array. This makes the hand harder to track during gameplay.

## Approach

UI-only change. The engine, solver, Rust engine, and board fixtures are untouched.

`HandPanel.svelte` iterates over the 5-card initial hand (from `history[0]`) instead of the current hand array. For each slot, it checks whether the card is still in the current hand by ID. Present cards render normally; absent cards render as ghost slots.

## Design

### Data source

`HandPanel` derives `initialHand` from `$game.history[0]` — the game-start state's hand for the component's `owner` prop. This 5-card array defines fixed slot positions. The existing `hand` derived (from `currentState`) stays as-is for current-state lookups.

### Template

Replace `{#each hand as card (card.id)}` with:

```svelte
{#each initialHand as slot (slot.id)}
  {@const card = hand.find(c => c.id === slot.id)}
  {#if card}
    <!-- existing RevealableCard + card button markup (unchanged) -->
  {:else}
    <!-- ghost slot div: same dimensions, dashed border, no content, no RevealableCard wrapper -->
  {/if}
{/each}
```

Keying on `slot.id` keeps Svelte's diffing stable.

### Logic adjustments

All existing logic (`forcedCard`, `isForced`, `isDimmed`, `handleClick`, best-card highlight, unknown-card reveal) references the engine's `hand` array, which is unchanged. The only difference is iteration source — we loop `initialHand` but gate all behavior against the engine's dense hand.

### Ghost slot styling

A `div` with the same `w-20 h-20` dimensions as card buttons, styled with `rounded border border-dashed border-surface-700 bg-surface-900`.

### Edge cases

- **Game not started** (`history` empty): `initialHand` is empty array → no slots rendered → same as today.
- **Opponent hidden cards** (Three Open): `initialHand` contains placeholder cards with stable IDs → works identically.
- **Undo:** History pops, card reappears in `hand` → `find()` matches again → slot fills back in.
- **Order rule:** Dimming/forced logic uses the engine's `hand[0]`, not slot position. Works unchanged.
- **Swap:** `handleSwap()` creates `history[0]` with the post-swap hand. Slot positions reflect the post-swap order.

## What does NOT change

- `src/engine/board.ts` — `placeCard()` still splices cards out
- `src/engine/types.ts` — `GameState` hand types stay `readonly Card[]`
- `src/app/store.ts` — no store changes
- `engine-rs/` — no Rust changes
- Board fixtures — no fixture changes
- WASM worker / solver boundary — unchanged

## Testing

- UI tests for HandPanel: verify 5 slots always rendered, played cards become ghost slots, undo restores cards to original slots.
- E2E: existing game-flow tests should pass unchanged (they test gameplay, not slot positioning).
