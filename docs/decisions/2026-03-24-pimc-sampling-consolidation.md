# PIMC Sampling Consolidation

**Status:** Planned — not yet implemented

## Problem

PIMC sampling logic (candidate pool construction, weighted reservoir sampling, star budget
constraints) is duplicated across two languages:

- **TypeScript:** `src/engine/pimc.ts` — used by the WASM worker path
- **Rust:** `engine-rs/src/pimc.rs` — used by the native server path

Both implementations are identical today, but any future change to sampling heuristics
must be made in both places. This will inevitably drift.

## Decision

Consolidate sampling into Rust as the single source of truth. Expose a new
`wasm_pimc_solve` entry point that takes the game state, card pool, unknown card IDs, and
iteration count, runs the full PIMC loop (sampling + N solves), and returns aggregated
results. This mirrors what the native server already does via `pimc.rs::run_pimc`.

After consolidation, `src/engine/pimc.ts` shrinks to just the shared types/interfaces
needed by the store. All sampling and solving logic lives exclusively in Rust.

## Progress indicator

The current WASM path fires 50 individual worker messages and reports per-simulation
progress (e.g., "12/50"). The new single-call `wasm_pimc_solve` blocks until all
simulations complete, so per-sim progress updates are lost.

This is acceptable because the native server path (`POST /api/solve`) already has no
progress indicator — it blocks and returns the final result. Making the WASM path behave
identically keeps both paths symmetric.

When progress becomes a real UX need, one progress abstraction will be designed for both
paths simultaneously:

- **Server:** SSE stream or a polling endpoint (job ID + status endpoint)
- **WASM:** JS callback or chunked-batch approach

The delivery mechanism will differ by transport (HTTP vs WASM FFI), but the contract
("report current/total after each sim") can be designed once and applied to both.

## Scope of changes

### Rust (`engine-rs/`)
- Add `wasm_pimc_solve` function exported via `wasm-bindgen` — accepts game state JSON +
  card pool JSON + unknown card IDs + iteration count, runs sampling + solving internally,
  returns aggregated ranked moves
- `pimc.rs` becomes the single implementation for both WASM and native server

### TypeScript (`src/engine/`)
- `solver-wasm.worker.ts`: Replace the per-sim `simulate` message type with a single
  `pimc-solve` message that calls `wasm_pimc_solve`
- `pimc.ts`: Remove `buildCandidatePool`, `weightedSample`, `weightedSampleConstrained`,
  `computeStarBudgets`. Keep only the `PIMCCard` type interface if still needed by the
  store
- `store.ts`: Replace the 50-message fan-out with a single worker message; remove
  `pimcTally`, `pimcPending`, `pimcTotal` bookkeeping; simplify progress to
  loading/complete

### Tests
- Existing PIMC sampling tests in `tests/engine/` that test TS functions will need to be
  replaced with Rust unit tests (most already exist in `engine-rs/src/pimc.rs`)
- WASM integration tests in `solver.wasm.test.ts` should add a `wasm_pimc_solve` test
