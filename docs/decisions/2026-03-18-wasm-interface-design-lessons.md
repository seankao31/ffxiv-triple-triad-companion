# WASM Interface Design Lessons: TT Persistence Oversight

## The Incident

When porting the TypeScript solver to Rust/WASM, only `wasm_solve` (free function → fresh TT per call) was exposed via wasm-bindgen. The worker used it for All Open solves — identical to calling `findBestMove()` directly in TypeScript, which was already known to be slow. The performance regression wasn't caught until smoke testing.

The correct interface was already implemented in Rust (`Solver` struct with `solve()`/`reset()`), mirroring TypeScript's `createSolver()`. It just wasn't exposed at the wasm-bindgen boundary.

## Why It Happened

**1. The API contract was documented; the performance contract was not.**

The design doc (`2026-03-17-rust-wasm-solver-design.md`) correctly describes the Rust solver architecture — persistent TT via `Solver` struct, fresh TT per call for PIMC. But it didn't specify *which wasm-bindgen exports to create* for each use case. That decision was made implicitly during implementation and never validated.

**2. The worker's `newGame` no-op comment masked a missing implementation.**

```typescript
if (msg.type === 'newGame') {
  // No-op: wasm_solve/wasm_simulate create fresh TTs per call, no persistent state to reset.
  return;
}
```

The comment described the current behavior as intentional design. But `newGame` being a no-op was a symptom of missing persistent state — the TS solver worker resets the TT on `newGame` precisely *because* it has persistent state.

**3. Correctness tests can't catch performance properties.**

The cross-verification test verified that Rust and TypeScript return identical results. Correct answers don't require a warm TT — they just require *a* TT. A fresh TT gives correct answers, just slowly. No test measured TT occupancy at the WASM boundary until after the regression was observed.

## What the Fix Looks Like

Expose `WasmSolver` (the Rust `Solver` struct) via wasm-bindgen:
- `solve()` — reuses TT across calls (warm across turns in All Open)
- `reset()` — clears TT on new game
- `tt_size()` — observable TT occupancy for testing

Use `WasmSolver` in the worker for All Open (`solve` messages); keep `wasm_simulate` for PIMC (`simulate` messages, fresh TT, parallel-safe).

## Rules for Future WASM Interface Work

**1. At every wasm-bindgen boundary, document the performance contract, not just the API contract.**

```rust
/// WASM entry point: accepts a JSON-serialized GameState, returns JSON-serialized Vec<RankedMove>.
/// Uses a fresh transposition table per call — correct for PIMC simulations
/// where multiple workers run in parallel and must not share TT state.
/// For All Open (single-turn solving), use WasmSolver which persists the TT across turns.
#[wasm_bindgen]
pub fn wasm_solve(state_json: &str) -> String { ... }
```

**2. Treat a no-op `newGame` handler as a red flag.**

If `newGame` does nothing in the worker, either:
- It's correct (PIMC workers have no persistent state) — document this explicitly
- It's wrong (missing persistent solver) — fix it

**3. Port performance-critical properties explicitly.**

When a TypeScript pattern exists for performance reasons (`createSolver()` = warm TT), create a corresponding test at the Rust WASM boundary that verifies the same property:

```typescript
it('TT is non-empty after turn-1 solve', () => {
  const solver = new WasmSolver();
  solver.solve(openingStateJson);
  expect(solver.tt_size()).toBeGreaterThan(0);
});
```

This is what `solver_reuses_tt_across_calls` does in Rust integration tests — the WASM layer needs its own version.

**4. Design docs should specify the wasm-bindgen interface, not just the Rust architecture.**

"The Rust solver will have a persistent TT" is incomplete. The spec should say: "wasm-bindgen will expose `WasmSolver` (persistent) for All Open and `wasm_simulate` (fresh) for PIMC — see the TypeScript worker's `solve`/`simulate` message handlers for the mapping."
