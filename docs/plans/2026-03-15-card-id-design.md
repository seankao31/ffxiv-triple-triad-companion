# Card Identity Design

**Date:** 2026-03-15
**Status:** Approved

## Problem

The transposition table (TT) hash in `solver.ts` was built on `buildCardIndex`, which assigned compact indices to cards by their stats (`top * 5000 + right * 500 + ...`). If both Player and Opponent hold a card with identical stats, both map to the same index. The hash encodes current board ownership correctly, but cannot distinguish which player's copy of a card is still in hand. This means two genuinely different mid-game positions — one where Player has the remaining copy, one where Opponent does — produce the same TT hash and corrupt each other's cached values, causing incorrect move rankings.

## Root Cause

`hashState` only encodes the board, not the remaining hands. The implicit assumption that "board state determines hands" breaks down when two hands contain cards with identical stats.

## Decision

Add `readonly id: number` to the `Card` interface. A module-level auto-increment counter in `createCard` assigns a unique ID to every card at construction time. IDs are primitive numbers and survive `postMessage` structured clone, solving the hash collision at its root.

## Design

### `Card` interface (`types.ts`)

```typescript
let _nextCardId = 0;

export interface Card {
  readonly id: number;
  readonly top: number;
  // ... rest unchanged
}

export function createCard(top, right, bottom, left, type = CardType.None): Card {
  return { id: _nextCardId++, top, right, bottom, left, type };
}
```

### `cardEquals` removed (`types.ts`, `index.ts`, components)

`cardEquals` existed to paper over reference loss from `postMessage`. With IDs surviving structured clone, callers replace `cardEquals(a, b)` with `a.id === b.id` directly. The function is removed from `types.ts` and `index.ts`.

### `buildCardIndex` eliminated (`solver.ts`)

`buildCardIndex`, `cardIndex` params, and the `Map<number, number>` state in `createSolver` are all removed. `hashState` uses `card.id + 1` directly as the index (the `+1` keeps the 1-based scheme required so that empty cells hash to 0 unambiguously).

```typescript
// Before
const idx = cardIndex.get(cardId(cell.card))!;
h += (cell.owner === Owner.Player ? idx * 2 - 1 : idx * 2) * shift;

// After
const idx = cell.card.id + 1;
h += (cell.owner === Owner.Player ? idx * 2 - 1 : idx * 2) * shift;
```

### `cardId` renamed to `statsKey` (`solver.ts`)

The stats-hash function is retained for the within-hand dedup optimization (skipping identical-stats cards from the same hand), but renamed to avoid confusion with `card.id`.

### `reset()` simplified (`solver.ts`, `solver.worker.ts`, `store.ts`)

`reset(playerHand, opponentHand)` was only needed to build `cardIndex`. It becomes `reset()` — just clears the TT. The `newGame` Worker message drops its `playerHand`/`opponentHand` fields. `store.ts` stops sending hand data in `newGame`.

## PIMC Compatibility

Each PIMC sample creates a fresh `GameState` with sampled opponent cards. Because `createCard` auto-assigns unique IDs, sampled cards are inherently distinguishable from each other and from the player's known cards, even when their stats collide. Each sample's search uses a fresh TT, so no cross-sample contamination. This is strictly better than the old stats-based approach for PIMC.

## Files Changed

| File | Change |
|------|--------|
| `src/engine/types.ts` | Add `id` to `Card`; update `createCard`; remove `cardEquals` |
| `src/engine/index.ts` | Remove `cardEquals` export |
| `src/engine/solver.ts` | Remove `buildCardIndex`, `cardIndex` params; rename `cardId` → `statsKey`; simplify `reset()` |
| `src/engine/solver.worker.ts` | Simplify `InMessage.newGame`; drop params from `reset()` call |
| `src/app/store.ts` | Drop hand data from `newGame` postMessage |
| `src/app/components/game/Board.svelte` | Replace `cardEquals` with `a.id === b.id` |
| `src/app/components/game/HandPanel.svelte` | Replace `cardEquals` with `a.id === b.id` |
| `src/app/components/game/SolverPanel.svelte` | Replace `cardEquals` with `a.id === b.id` |
| `tests/engine/solver.test.ts` | Add TT collision regression test; update `createSolver` tests |
| `tests/app/components/Board.test.ts` | Update deserialized-source test comments |
| `tests/app/components/HandPanel.test.ts` | Update deserialized-source test comments |
