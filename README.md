# Project Triad

The "Stockfish" of FFXIV Triple Triad — a real-time move optimizer and companion app. See `PRD.md` for full product requirements.

## Current Status

**Phase 1 (Engine) — Complete.** The core TypeScript game engine is implemented, tested, and merged to `main`.

**Phase 2 (UI) — Not started.** Svelte + Tailwind frontend that imports the engine.

## Architecture

Engine-first. The engine is a pure TypeScript library with no UI dependencies. The Svelte UI imports it as a module. When the imperfect-information solver (PIMC) needs performance, only the engine is ported to Rust/WASM — the UI layer is unchanged.

```
src/
  engine/
    types.ts      — Card, BoardCell, GameState, RuleSet, enums, helpers, ADJACENCY
    board.ts      — placeCard: Plus → Same → Combo cascade → Standard capture
    solver.ts     — findBestMove: minimax + alpha-beta + TT with bounds + robustness
    index.ts      — public API barrel export
  data/
    cards.json    — 464 cards scraped from ffxivcollect.com API
scripts/
  scrape-cards.ts — one-off script to refresh card data
tests/
  engine/
    board.test.ts — 22 tests: placement, capture rules, combos, edge cases, full game
    solver.test.ts — 8 tests: move ranking, tie-breaking, robustness, performance
  scripts/
    scrape-cards.test.ts — 5 tests: card transform and type mapping
docs/
  plans/
    2026-03-04-triple-triad-engine-design.md  — architecture and design decisions
    2026-03-04-triple-triad-engine-plan.md    — original 13-task implementation plan
  decisions/
    2026-03-05-engine-implementation-decisions.md  — decisions made during code review
```

## Engine Public API

```typescript
import {
  createCard, createInitialState, placeCard, findBestMove,
  getScore, Owner, Outcome, CardType,
  type Card, type GameState, type RuleSet, type RankedMove,
} from "./src/engine";

const state = createInitialState(playerHand, opponentHand, Owner.Player, { plus: true, same: false });
const moves = findBestMove(state);  // RankedMove[], sorted Win > Draw > Loss, then by robustness
const next  = placeCard(state, moves[0].card, moves[0].position);
```

## Key Design Decisions

- **Immutable state** — every operation returns a new `GameState`; enables free undo/redo and clean solver search
- **RuleSet on GameState** — Plus/Same are optional per-game, stored on state so all `placeCard` calls are consistent
- **TT with bounds** — transposition table stores `(value, Exact|LowerBound|UpperBound)` for correct alpha-beta integration
- **Robustness** — tie-breaking metric: fraction of opponent responses that are *mistakes* (lead to a strictly better outcome for us); always 0 for winning moves
- **First turn configurable** — `createInitialState` accepts optional `firstTurn` (default: `Owner.Player`)

See `docs/decisions/` for full rationale on each.

## Tech Stack

| Concern | Tool |
|---------|------|
| Runtime | Bun |
| Language | TypeScript (strict, noUncheckedIndexedAccess) |
| Bundler | Vite (needed for Svelte) |
| Tests | `bun test` |
| Frontend (Phase 2) | Svelte + Tailwind CSS |

## Running Tests

```bash
bun test
```

## What's Next (Phase 2)

See `PRD.md` §3.2 for full Live Solver requirements. High-level:

1. Scaffold Svelte + Vite app in `src/app/`
2. Card input UI (player hand + opponent hand, 4 values + type per card)
3. 3×3 board component with click-to-place
4. Solver output panel — ranked moves with Win/Draw/Loss outcome and robustness
5. Turn management — after each placement, re-run solver and update UI
6. Undo/redo via immutable state history stack
