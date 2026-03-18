# Project Triad

The "Stockfish" of FFXIV Triple Triad — a real-time move optimizer and companion app. See `PRD.md` for full product requirements.

## Current Status

**Phase 1 (Engine) — Complete.** The core TypeScript game engine is implemented, tested, and merged to `main`.

**Phase 2 (UI) — Complete.** Svelte 5 + Tailwind CSS v4 frontend with a Live Solver view. Two-phase app: setup (card entry) → play (board + solver suggestions).

**Phase 3 (Three Open + PIMC + Swap) — Complete.** Three Open mode allows up to 2 unknown opponent cards, solved via Rust/WASM PIMC (4 parallel workers, 50 simulations, star-constrained weighted sampling). Swap rule support added.

## Architecture

Engine-first. The TypeScript engine is a pure library with no UI dependencies. The Rust engine (`engine-rs/`) compiles to WASM for in-browser solving and optionally as a native binary for a faster solver server.

```
src/
  engine/
    types.ts      — Card, BoardCell, GameState, RuleSet, enums, helpers, ADJACENCY
    board.ts      — placeCard: Plus → Same → Combo cascade → Standard capture; all 6 capture rules
    solver.ts     — minimax + alpha-beta + adaptive TT + robustness; createSolver() and findBestMove()
    pimc.ts       — PIMC sampling helpers: buildCandidatePool, computeStarBudgets
    index.ts      — public API barrel export
  app/
    main.ts       — Svelte app entry point
    App.svelte    — root component, phase-based view switching
    store.ts      — central Svelte store (phase, hands, history, solver mode, PIMC progress)
    app.css       — Tailwind CSS entry
    components/
      setup/      — SetupView, HandInput, CardInput, RulesetInput, SwapStep, ServerSettings
      game/       — GameView, Board, BoardCell, HandPanel, SolverPanel
  data/
    cards.json    — 464 cards scraped from ffxivcollect.com API
engine-rs/
  src/
    lib.rs        — wasm-bindgen exports: wasm_solve, wasm_simulate
    types.rs      — Rust port of all engine types (Card, GameState, RuleSet, RankedMove, …)
    board.rs      — Rust board logic with in-place mutation + UndoRecord for minimax
    solver.rs     — Rust minimax with alpha-beta, flat-array TT (128K entries), robustness
    pimc.rs       — Server-side PIMC: weighted reservoir sampling, Rayon parallelism
    bin/server.rs — Axum HTTP server at POST /api/solve (optional, server feature only)
  Cargo.toml      — dual-target: cdylib (WASM) + rlib; server feature gates Axum/Rayon deps
  tests/          — Rust integration tests (board fixtures, solver fixtures)
pkg/              — wasm-pack output (gitignored; must be built before dev/build — see below)
scripts/
  scrape-cards.ts — one-off script to refresh card data
tests/
  engine/
    board.test.ts      — 38 tests: placement, all capture rules
    solver.test.ts     — 25 fast tests + self-play consistency + TT tests
    solver.cross.test.ts — 1000-state property test: TypeScript vs WASM output must match
  app/
    store.test.ts      — 111 tests: phase transitions, placement, undo, PIMC, server mode
    components/        — CardInput, SetupView, Board, HandPanel, SolverPanel
    setup.ts           — Vitest global setup (jest-dom matchers)
  scripts/
    scrape-cards.test.ts — 5 tests: card transform and type mapping
docs/
  plans/
    2026-03-04-triple-triad-engine-design.md     — engine architecture design
    2026-03-05-svelte-ui-design.md               — Phase 2 UI design
    2026-03-15-card-id-design.md                 — card ID scheme for TT hashing
    2026-03-17-rust-wasm-solver-design.md        — Rust/WASM design spec
    2026-03-17-rust-wasm-implementation-plan.md  — 10-step implementation plan
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
- **Robustness** — tie-breaking metric: fraction of opponent responses that are *mistakes* (lead to a strictly better outcome for us); always 0 for winning moves
- **First turn configurable** — `createInitialState` accepts optional `firstTurn` (default: `Owner.Player`)
- **Rust/WASM dual-target** — `engine-rs/` compiles to WASM (default, zero setup) or native binary (optional server); same crate, feature-gated Axum/Rayon deps
- **In-place mutation** — Rust solver uses `place_card_mut` + `UndoRecord` to avoid allocation during minimax; ~3–5× speedup over immutable clone
- **PIMC for Three Open** — unknown opponent cards are sampled from the full card pool using Efraimidis–Spirakis weighted reservoir sampling with star-tier budget constraints

See `docs/decisions/` for full rationale on each.

## Tech Stack

| Concern | Tool |
|---------|------|
| Runtime | Bun |
| Language | TypeScript (strict, noUncheckedIndexedAccess) + Rust (2021 edition) |
| Framework | Svelte 5 |
| Styling | Tailwind CSS v4 |
| Bundler | Vite |
| WASM build | wasm-pack |
| Engine tests | `bun test tests/engine` (TypeScript) / `cargo test` (Rust) |
| UI tests | `bunx vitest run` (happy-dom + @testing-library/svelte) |

## Running Tests

```bash
# All TypeScript tests (engine + UI)
bun run test

# Engine only
bun run test:engine

# UI only
bun run test:app

# Rust tests (fast unit + integration, skips benchmarks)
cd engine-rs && cargo test --features server -- --skip benchmark

# Rust tests including benchmarks (slow — benchmarks run for ~2 min total)
cd engine-rs && cargo test --features server
```

## Development

```bash
bun run dev     # Vite dev server at localhost:5173 (requires pkg/ — see WASM build step below)
bun run build   # Production build to dist/
bun run check   # Svelte type checking
```

### Building the WASM module

`pkg/` is gitignored and must be built before running the app. Run this once after cloning, and again after changes to `engine-rs/`:

```bash
cd engine-rs && wasm-pack build --target web --out-dir ../pkg
```

Requires: [Rust toolchain](https://rustup.rs/) + `cargo install wasm-pack`

### Running the native solver server (optional)

The native server runs PIMC with Rayon thread-pool parallelism, which is faster than 4 browser workers. Select "Native server" in the setup screen and point it at the running server.

```bash
# Build
cd engine-rs && cargo build --release --features server --bin server

# Run (listens on http://127.0.0.1:8080)
./engine-rs/target/release/server
```

Requires: Rust toolchain (no wasm-pack needed for the server binary).

## What's Next

See `PRD.md` for the full product vision. Potential next steps:

- **Deck Builder** (PRD §3.3) — collection manager + optimization algorithm
- **Post-Game Analysis** (PRD §3.4) — game replay with move classification
- **Hidden game support** — full deck optimizer data as sampling weights for the unknown pool
