# Card Identity Design

**Date:** 2026-03-15

## Problem

The transposition table hash (`hashState`) encoded only the board — which cards occupied which cells and who owned them. It did not encode the remaining hands. The implicit assumption was "board state determines hands," which holds when every card has unique stats. But when both players hold cards with identical stats (e.g., two copies of a 4-8-8-1), the hash cannot distinguish which player's copy is still in hand. Two genuinely different mid-game positions — one where Player has the remaining copy, one where Opponent does — produce the same hash and corrupt each other's cached values, causing incorrect move rankings.

## Root Cause

`buildCardIndex` assigned compact indices to cards by their stats (`top * 5000 + right * 500 + ...`). Cards with identical stats mapped to the same index. The hash was correct for board ownership but blind to hand composition.

## Decision: Add `card.id`

A `readonly id: number` field on the `Card` interface. A module-level auto-increment counter in `createCard` assigns a unique ID at construction time. IDs are primitive numbers and survive `postMessage` structured clone, which was the original reason `cardEquals` existed (object references don't survive structured clone; IDs do).

### Cascading simplifications

The single decision to add `card.id` eliminated three pieces of machinery:

- **`buildCardIndex`** — no longer needed; `hashState` uses `card.id + 1` directly as the index (the +1 keeps the 1-based scheme so empty cells hash to 0 unambiguously).
- **`cardEquals(a, b)`** — replaced everywhere by `a.id === b.id`. The function existed solely to work around structured-clone reference loss.
- **`reset(playerHand, opponentHand)`** — was only needed to build `cardIndex` from both hands. Became a simple `reset()` that just clears the TT. The `newGame` Worker message dropped its hand fields.

### `resetCardIds()` constraint

`card.id` must be < 15 for the base-32 hash encoding scheme to work. `resetCardIds()` resets the counter to 0 and is called in `startGame()`, `handleSwap()`, and test `beforeEach` to keep IDs in the 0–9 range per game.

## PIMC Compatibility

Each PIMC sample creates a fresh `GameState` with sampled opponent cards. Because `createCard` auto-assigns unique IDs, sampled cards are inherently distinguishable from each other and from the player's known cards, even when their stats collide. Each sample's search uses a fresh TT, so no cross-sample contamination. This is strictly better than the old stats-based approach for PIMC.

## Relationship to Other Hash Bugs

This is a distinct issue from the `buildCardIndex` NaN bug documented in `2026-03-07-solver-correctness-fixes.md`. That bug was about board cards not being included in the index at all (causing `Map.get()` to return `undefined`, which propagated as NaN). This bug is about two valid-but-identical indices colliding when both players share the same card stats.
