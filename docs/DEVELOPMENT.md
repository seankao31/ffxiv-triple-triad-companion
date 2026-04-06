# Development Guide

## Prerequisites

- [Bun](https://bun.sh/) (runtime + package manager)
- [Rust toolchain](https://rustup.rs/) + `cargo install wasm-pack` (for WASM builds)

## Project Structure

```
src/
  engine/
    types.ts      — Card, BoardCell, GameState, RuleSet, enums, helpers
    board.ts      — placeCard: Plus → Same → Combo cascade → Standard capture
    pimc.ts       — PIMC sampling helpers: buildCandidatePool, weighted sampling
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
    types.rs      — Rust port of all engine types
    board.rs      — Rust board logic with in-place mutation + UndoRecord
    solver.rs     — negamax with alpha-beta, flat-array TT (4M entries), depth-aware replacement
    pimc.rs       — Server-side PIMC: weighted reservoir sampling, Rayon parallelism
    bin/server.rs — Axum HTTP server: POST /api/solve (optional, server feature only)
  Cargo.toml      — dual-target: cdylib (WASM) + rlib; server feature gates Axum/Rayon deps
  tests/          — Rust integration tests (board fixtures, solver fixtures)
pkg/              — wasm-pack output (gitignored; rebuild after engine-rs changes)
scripts/
  scrape-cards.ts — one-off script to refresh card data
tests/
  engine/         — board + PIMC sampling + WASM solver tests
  app/            — UI tests (vitest + happy-dom + @testing-library/svelte)
  bench/          — on-demand WASM benchmarks (PIMC, opening position)
  e2e/            — Playwright E2E tests (game flow, reset, undo, swap)
  fixtures/
    board/        — shared board fixtures (contract between TS and Rust engines)
docs/
  plans/          — design documents
  decisions/      — implementation decision records
```

## Building the WASM Module

`pkg/` is gitignored and must be built before running the app. Run this once after cloning, and again after changes to `engine-rs/`:

```bash
cd engine-rs && wasm-pack build --target web --out-dir ../pkg
```

## Running Locally

```bash
bun install
bun run dev       # Vite dev server at localhost:5173 (requires pkg/)
bun run build     # Production build to dist/
bun run check     # Svelte type checking
```

## Running Tests

```bash
# All TypeScript tests (engine + UI)
bun run test

# All tests including E2E (requires WASM pre-built)
bun run test:all

# Engine only
bun run test:engine

# UI only
bun run test:app

# Rust tests (unit + integration)
cd engine-rs && cargo test --features server

# E2E tests (Playwright, requires WASM pre-built)
bun run test:e2e
```

### On-demand benchmarks

```bash
# Rust benchmarks (heavy, requires --release)
cd engine-rs && cargo test --release -- --ignored

# WASM benchmarks (opening position + PIMC sims)
bun run bench:wasm
```

## Cross-Engine Alignment

The TypeScript engine (`src/engine/board.ts`) and Rust engine (`engine-rs/src/board.rs`) implement identical game logic. Board fixtures in `tests/fixtures/board/` are the shared contract between them.

When adding or modifying board logic tests in either engine, check whether the scenario should be a shared fixture. If it tests `placeCard` behavior, add it to `scripts/generate-board-fixtures.ts` and regenerate.

## Native Solver Server (Optional)

The native server runs PIMC with Rayon thread-pool parallelism, which is faster than browser WASM workers. Select "Native server" in the setup screen.

```bash
# Build
cd engine-rs && cargo build --release --features server --bin server

# Run (listens on http://127.0.0.1:8080)
./engine-rs/target/release/server

# Custom port
./engine-rs/target/release/server --port 9090
```

Requires only the Rust toolchain (no wasm-pack needed).

## Key Design Decisions

- **Immutable state (TS)** — every operation returns a new `GameState`; enables free undo/redo
- **In-place mutation (Rust)** — `place_card_mut` + `UndoRecord` avoids allocation during negamax
- **Dual-target crate** — `engine-rs/` compiles to WASM (default) or native binary; same crate, feature-gated deps
- **PIMC for incomplete information** — unknown opponent cards are sampled via Efraimidis–Spirakis weighted reservoir sampling with star-tier budget constraints
- **Transposition table** — 4M-entry flat array (64MB) with depth-aware replacement and `(value, Exact|LowerBound|UpperBound)` bounds for correct alpha-beta integration

See `docs/decisions/` for full rationale.
