# Rust/WASM Solver Design

**Date:** 2026-03-17

## Problem

PIMC (Perfect Information Monte Carlo) for Three Open requires running ~50 independent solver searches per turn. The TypeScript engine took ~21 seconds per search with real-world hands (5 distinct cards per side, no deduplication). With 4 Web Workers: `50 sims / 4 workers × 21s = 262 seconds per turn` — unusable.

Additionally, each worker's unbounded transposition table grew to V8's 2^24 Map limit (~838MB–1.6GB per worker), causing OOM crashes at ~3.7GB total browser heap.

**Latency budget:** 60 seconds cumulative per game (~5 player turns).

## Rejected Alternatives

### Bun/Node.js server

The 21s baseline was already measured on Bun (JSC). A Bun server runs the same engine at roughly the same speed. On a self-hosted 8-core machine: `ceil(50/8) × 21s = 147s`. Doesn't solve the compute problem.

### Go server

Go is ~10–20× faster than V8 for numeric code and has great concurrency. However, Rust compiles to both native and WASM from one codebase — Go doesn't meaningfully target WASM. The dual-target capability was the deciding factor: in-browser (no server) is the default experience, with an optional server for power users. Only Rust can serve both from a single codebase.

### IS-MCTS (Information Set Monte Carlo Tree Search)

IS-MCTS builds a shared tree over observable game state, avoiding per-simulation TT waste. However, for Three Open (only 2 unknown cards), the information set is small and PIMC with good sampling converges quickly. IS-MCTS also has strategy fusion issues and is more complex to implement. With deck optimizer data eventually constraining the sample space, PIMC remains tractable even for future hidden-game support.

### TT persistence across simulations

TT entries from one PIMC simulation are semantically invalid in another: different sampled opponent cards mean the same board hash maps to a different game-theoretic value. Cross-simulation TT reuse is not possible.

### TT persistence across turns (OPFS/IndexedDB)

Cross-turn TT reuse (persisting per-simulation TTs between turns) was considered but unnecessary: the game tree shrinks ~45× per turn, so cold solves on later turns are cheap. The I/O overhead of loading 50 TTs from OPFS (~200ms each) would negate the warm-TT benefit.

## Architecture

### Dual compilation targets from one codebase

```
engine-rs/
├── src/
│   ├── types.rs       Card, GameState, Owner, RankedMove
│   ├── board.rs       placeCard, capture rules, in-place mutation + undo
│   ├── solver.rs      negamax, alpha-beta, transposition table
│   ├── pimc.rs        weighted sampling, Rayon parallelism (server feature)
│   └── lib.rs         WASM API (WasmSolver, wasm_simulate)
├── src/bin/
│   └── server.rs      Axum HTTP server (native target only)
└── Cargo.toml
```

**WASM target (default, in-browser):** Built with `wasm-pack`, loaded by Web Workers. `WasmSolver` class for persistent TT (All Open); `wasm_simulate` free function for PIMC (fresh TT per sim).

**Native target (optional server):** Axum binary with Rayon thread-parallel PIMC. Stateless API — each request contains everything needed.

### In-place mutation with undo — the key performance win

The TypeScript engine created immutable state copies on every `placeCard()` — millions of allocations per search. The Rust engine uses in-place mutation with an undo stack:

```rust
fn place_card_mut(state: &mut GameState, card: Card, position: usize) -> UndoRecord;
fn undo_place(state: &mut GameState, undo: UndoRecord);
```

`UndoRecord` captures which cells changed owner (from captures) so they can be reversed. This eliminates all heap allocation during search and is the single largest performance win (estimated 5–10× by itself). It also means the Rust port is a rewrite, not a transliteration of the TS engine — fundamentally different code structure.

### Transposition table

Fixed-size flat array (`Vec<TTSlot>`, 4M entries = ~64MB). Each slot stores a full `u64` key for collision detection, with Fibonacci hashing for index computation. Depth-aware replacement policy: only overwrite an occupied slot if the incoming depth ≥ existing depth. This preserves root-adjacent entries (expensive to recompute) against leaf entries (cheap), yielding a ~200× turn-2 speedup over always-replace.

For All Open (perfect info): persistent TT kept across turns via `WasmSolver`. For PIMC: fresh TT per simulation via `wasm_simulate`. Since only 4 workers run concurrently, peak memory is bounded by 4 × 64MB ≈ 256MB.

### Worker model

```
store.ts (triggerSolve)
  │
  ├── All Open: 1 dedicated WASM worker
  │   └── WasmSolver with persistent TT across turns
  │
  └── Three Open / PIMC: 4 WASM worker pool
      Each worker: wasm_simulate with fresh TT per sim
      PIMC orchestration (sampling, aggregation) in TypeScript
```

PIMC orchestration stays in TypeScript — it's not compute-intensive and benefits from direct access to the card database and sampling weights.

### Cross-verification strategy

The TypeScript engine served as the reference implementation during the Rust port. Shared JSON test fixtures (`tests/fixtures/board/`) define `{input_state, expected_output}` pairs run against both engines. Board tests compare cell ownership after `placeCard`. This was the safety net that made the rewrite viable despite the fundamentally different code structure (immutable copies vs. mutation + undo).

The TypeScript solver was removed after cross-verification passed comprehensively (2026-03-23). Only game logic (types, board rules, PIMC sampling utilities) remains in `src/engine/`.

## Outcome

Actual per-simulation time in Rust/WASM: ~0.7s for opening position (vs. 21s in TypeScript — a 30× speedup). See `2026-03-18-pimc-performance-baseline.md` for measured numbers.
