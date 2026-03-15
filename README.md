# Project Triad

The "Stockfish" of FFXIV Triple Triad — a real-time move optimizer and companion app. See `PRD.md` for full product requirements.

## Current Status

**Phase 1 (Engine) — Complete.** The core TypeScript game engine is implemented, tested, and merged to `main`.

**Phase 2 (UI) — Complete.** Svelte 5 + Tailwind CSS v4 frontend with a Live Solver view. Two-phase app: setup (card entry) → play (board + solver suggestions).

## Architecture

Engine-first. The engine is a pure TypeScript library with no UI dependencies. The Svelte UI imports it as a module. When the imperfect-information solver (PIMC) needs performance, only the engine is ported to Rust/WASM — the UI layer is unchanged.

```
src/
  engine/
    types.ts      — Card, BoardCell, GameState, RuleSet, enums, helpers, ADJACENCY
    board.ts      — placeCard: Plus → Same → Combo cascade → Standard capture; all 6 capture rules
    solver.ts     — minimax + alpha-beta + adaptive TT + robustness; createSolver() and findBestMove()
    index.ts      — public API barrel export
  app/
    main.ts       — Svelte app entry point
    App.svelte    — root component, phase-based view switching
    store.ts      — central Svelte store (phase, hands, history, selected card)
    app.css       — Tailwind CSS entry
    components/
      setup/      — SetupView, HandInput, CardInput, RulesetInput
      game/       — GameView, Board, BoardCell, HandPanel, SolverPanel
  data/
    cards.json    — 464 cards scraped from ffxivcollect.com API
scripts/
  scrape-cards.ts — one-off script to refresh card data
tests/
  engine/
    board.test.ts  — 38 tests: placement, all capture rules (Basic/Reverse/Fallen Ace/Ascension/Descension/Plus/Same/Combo)
    solver.test.ts — 25 fast tests + self-play consistency + TT cap; 1 slow performance test
  app/
    store.test.ts — 20 tests: phase transitions, placement, undo, derived stores
    components/   — 44 tests across CardInput, SetupView, Board, HandPanel, SolverPanel
    setup.ts      — Vitest global setup (jest-dom matchers)
  scripts/
    scrape-cards.test.ts — 5 tests: card transform and type mapping
docs/
  plans/
    2026-03-04-triple-triad-engine-design.md — engine architecture design
    2026-03-05-svelte-ui-design.md           — Phase 2 UI design
    2026-03-15-card-id-design.md             — card ID scheme for TT hashing
  decisions/
    2026-03-05-engine-implementation-decisions.md — engine decisions
    2026-03-06-ui-implementation-decisions.md     — UI decisions
    2026-03-07-solver-correctness-fixes.md        — solver bug fixes
```

## Engine Public API

```typescript
import {
  createCard, createInitialState, placeCard, findBestMove,
  getScore, Owner, Outcome, CardType,
  type Card, type GameState, type RuleSet, type RankedMove,
} from "./src/engine";

const state = createInitialState(playerHand, opponentHand, Owner.Player, {
  plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false,
});
const moves = findBestMove(state);  // RankedMove[], sorted Win > Draw > Loss, then by robustness
const next  = placeCard(state, moves[0].card, moves[0].position);
```

## Key Design Decisions

- **Immutable state** — every operation returns a new `GameState`; enables free undo/redo and clean solver search
- **RuleSet on GameState** — all six rules (Plus, Same, Reverse, Fallen Ace, Ascension, Descension) stored on state so all `placeCard` calls are consistent
- **TT with bounds** — transposition table stores `(value, Exact|LowerBound|UpperBound)` for correct alpha-beta integration
- **Adaptive TT cap** — `createSolver()` catches V8's `RangeError: Map maximum size exceeded` and self-calibrates; no performance penalty on engines without a limit (JSC/Bun)
- **Robustness** — tie-breaking metric: fraction of opponent responses that are *mistakes* (lead to a strictly better outcome for us); always 0 for winning moves
- **First turn configurable** — `createInitialState` accepts optional `firstTurn` (default: `Owner.Player`)

See `docs/decisions/` for full rationale on each.

## Tech Stack

| Concern | Tool |
|---------|------|
| Runtime | Bun |
| Language | TypeScript (strict, noUncheckedIndexedAccess) |
| Framework | Svelte 5 |
| Styling | Tailwind CSS v4 |
| Bundler | Vite |
| Engine tests | `bun test tests/engine` |
| UI tests | `bunx vitest run` (happy-dom + @testing-library/svelte) |

## Running Tests

```bash
# All tests
bun run test

# Engine only
bun run test:engine

# UI only
bun run test:app
```

## Development

```bash
bun run dev     # Vite dev server at localhost:5173
bun run build   # Production build to dist/
bun run check   # Svelte type checking
```

## What's Next

See `PRD.md` for the full product vision. Potential next steps:

- **Imperfect information** — Three Open support with PIMC solver and `(Card | null)[]` hand slots
- **Swap rule** — mid-game card exchange UI in the play phase
- **Card database** — select from `cards.json` instead of entering values manually
- **Deck Builder** (PRD §3.3) — collection manager + optimization algorithm
- **Post-Game Analysis** (PRD §3.4) — game replay with move classification
