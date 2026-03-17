# Rust/WASM Solver Design

## Problem

PIMC (Perfect Information Monte Carlo) for Three Open requires running 50 independent minimax
searches per turn. The TypeScript engine takes ~21 seconds per search with real-world hands
(5 distinct cards per side, no deduplication). With 4 Web Workers:
`50 sims / 4 workers × 21s = 262 seconds per turn` — unusable.

Additionally, each worker's unbounded transposition table (TT) grows to V8's 2^24 Map limit
(~838MB–1.6GB per worker), causing OOM crashes at ~3.7GB total browser heap.

## Constraints

- **Latency budget:** 60 seconds cumulative per game (~5 player turns).
- **Real hands:** Typical competitive decks have 5 fully distinct cards (e.g., 4-8-8-1,
  1-4-8-8, 8-2-8-A, 8-2-3-8, 2-5-9-9). No deduplication benefit.
- **Deployment:** Open-source, self-hosted. In-browser (no server) is the default experience.
  Optional server for power users.
- **Future scope:** Hidden games (all 5 opponent cards unknown), deck optimizer integration.

## Decision: Why Not Alternative Approaches

### Bun/Node.js server
The 21s baseline was already measured on Bun (JSC). A Bun server runs the same engine at
roughly the same speed. On a self-hosted 8-core machine: `ceil(50/8) × 21s = 147s`.
Doesn't solve the compute problem.

### Go server
Go is ~10–20× faster than V8 for numeric code and has great concurrency. However, Rust
compiles to both native and WASM from one codebase — Go doesn't meaningfully target WASM.
The dual-target capability is the deciding factor.

### IS-MCTS (Information Set Monte Carlo Tree Search)
IS-MCTS builds a shared tree over observable game state, avoiding per-simulation TT waste.
However, for Three Open (only 2 unknown cards), the information set is small and PIMC with
good sampling converges quickly. IS-MCTS has strategy fusion issues and is more complex to
implement. With deck optimizer data constraining the sample space, PIMC remains tractable
even for future hidden-game support.

### TT persistence to storage (OPFS/IndexedDB)
TT entries from one PIMC simulation are semantically invalid in another (different opponent
cards → same board hash but different game-theoretic value). Cross-simulation TT reuse is
not possible.

Cross-turn TT reuse (persisting per-simulation TTs between turns) was considered but
unnecessary: with Rust/WASM speeds, the game tree shrinks so fast on later turns that
cold solves are cheap. Turn 2 is ~45× smaller than turn 1. The I/O overhead of loading
50 TTs from OPFS (~200ms each) would negate the warm-TT benefit.

## Architecture

### Algorithm: PIMC with weighted sampling

PIMC remains the correct algorithm. Each simulation samples unknown opponent cards from a
weighted pool and runs full minimax. Results are aggregated by confidence (fraction of
simulations where each move was optimal).

Deck optimizer data (future) provides sampling weights — not a filter. Every card in the
database stays in the pool with non-zero weight. Cards in optimal decks get high weights;
non-meta cards get low weights. When an opponent reveals a non-meta card, the system
naturally adapts because the revealed card is known exactly (not sampled).

### Execution: Rust engine with dual compilation targets

The solver is written in Rust and compiled to two targets from the same codebase:

```
engine-rs/                  (Rust crate)
├── src/
│   ├── types.rs            Card, GameState, Owner, Outcome, RankedMove
│   ├── board.rs            placeCard, capture rules (Plus, Same, Reverse, FA, Asc, Desc)
│   ├── solver.rs           minimax, alpha-beta, TT, Solver struct
│   ├── pimc.rs             weighted sampling, star budgets, simulation orchestration
│   └── lib.rs              public API (shared by WASM and native targets)
├── src/bin/
│   └── server.rs           Axum HTTP server (native target only)
└── Cargo.toml
```

**WASM target (default, in-browser):**
- Built with `wasm-pack` + `wasm-bindgen`
- Loaded by Vite via WASM plugin
- Runs in Web Workers (4 workers, matching `navigator.hardwareConcurrency`)

**Native target (optional server):**
- Compiled as a standalone binary with Axum web framework
- Uses Rayon for thread-parallel simulations across all CPU cores
- User provides server endpoint in app settings

### In-place mutation with undo

The TypeScript engine creates immutable state copies on every `placeCard()` call — millions
of allocations per minimax search. The Rust engine uses in-place mutation with an undo stack:

```rust
fn place_card(state: &mut GameState, card_idx: usize, position: usize) -> UndoRecord;
fn undo_place(state: &mut GameState, undo: UndoRecord);
```

`UndoRecord` captures which cells changed owner (from captures) so they can be reversed.
This eliminates all heap allocation during search and is the single largest performance win
(estimated 5–10× by itself).

### TT design

```rust
struct TTEntry {
    key: u64,       // full hash for collision detection
    value: i8,      // -1, 0, 1
    flag: u8,       // Exact, LowerBound, UpperBound
}

struct TranspositionTable {
    entries: Vec<TTEntry>,  // fixed-size, power-of-2
    mask: usize,            // entries.len() - 1 for fast modulo
}
```

Fixed-size flat array with open addressing. Always-replace collision policy. **No artificial
cap on TT size** — each simulation creates a fresh TT that grows as needed during its search,
then discards it when done. Since only 4 workers run concurrently, peak memory is bounded by
4 × (one search's TT size) ≈ 400MB. No storage or swapping needed.

For All Open (perfect info, single solver): persistent TT kept across turns (same as current
TypeScript behavior). The TT reuse benefit is large here — turn 1 is the only expensive solve.

### Worker model

```
store.ts (triggerSolve)
  │
  ├── All Open: 1 dedicated WASM worker
  │   └── Persistent solver, TT kept across turns
  │
  └── Three Open / PIMC: 4 WASM worker pool
        Each worker receives: {state, sampledOpponentCards}
        Creates fresh solver (unbounded TT)
        Runs minimax, returns ranked move
        TT discarded after each simulation
```

PIMC orchestration (sampling card worlds, aggregating results) stays in TypeScript. It's not
compute-intensive and benefits from direct access to the card database.

### Native server API (optional)

Stateless — no sessions. Each request contains everything needed.

```
POST /api/solve
  Request:  { state, unknownCardIds, cardPool, samplingWeights?, simCount? }
  Response: { moves: RankedMove[] }
```

The server runs PIMC internally: samples worlds, fans out minimax across Rayon thread pool,
aggregates, returns ranked moves.

### Client integration

```typescript
const solverMode: 'wasm' | 'server' = getConfig('solverMode', 'wasm');
const serverEndpoint: string | null = getConfig('serverEndpoint', null);

function triggerSolve(state: GameState) {
  if (solverMode === 'server' && serverEndpoint) {
    triggerServerSolve(state);
  } else if (unknownCardIds.size > 0) {
    triggerWasmPIMC(state);   // 4 WASM workers
  } else {
    triggerWasmSolve(state);  // 1 WASM worker, persistent solver
  }
}
```

Svelte UI components remain unchanged — they read from the same `rankedMoves` and
`solverLoading` stores regardless of solver backend.

## Performance Budget

Estimated per-simulation time in Rust/WASM (conservative: 20× speedup over TypeScript):

| Turn | Per-sim (cold) | Wall clock (50 sims / 4 workers) |
|------|----------------|----------------------------------|
| Player turn 1 (opening) | ~0.7s | ~9s |
| Player turn 2 (2 cards placed) | ~0.05–0.1s | ~0.6–1.3s |
| Player turn 3 (4 cards placed) | ~0.01s | ~0.1s |
| Player turn 4+ | negligible | negligible |
| **Total game** | | **~10–11s** |

With native server on 8 cores: turn 1 drops to ~4.5s (50 sims / 8 cores × 0.7s).

## Cross-Verification Strategy

The TypeScript engine remains as the reference implementation during the Rust port.

1. **Shared test vectors:** Extract all 84+ engine test cases into JSON fixtures
   `{input_state, expected_output}`. Run against both TypeScript and Rust.
2. **Solver comparison:** For solver tests, compare ranked move output (card, position,
   outcome) — not internal TT state.
3. **Board comparison:** For board tests, compare resulting board state after `placeCard`
   (cell ownership, card positions).
4. **Property-based testing:** Generate random game states, run both solvers, assert
   identical ranked moves.

TypeScript engine is removed only after cross-verification passes comprehensively.

## Migration Path

### Phase A — Rust engine + WASM build pipeline
1. Create `engine-rs/` crate alongside `src/engine/`
2. Port `types`, `board`, `solver` to Rust
3. Cross-verify against TypeScript using shared test vectors
4. Set up `wasm-pack` build + Vite integration

### Phase B — WASM workers replace TypeScript workers
1. New WASM worker entry point replaces `solver.worker.ts`
2. `store.ts` routes solves to WASM workers
3. Verify all UI tests still pass

### Phase C — PIMC in WASM
1. PIMC orchestration works with WASM workers
2. Benchmark real hands (4-8-8-1 deck) to validate timing estimates
3. This resolves the original TT memory crash

### Phase D — Optional server binary
1. Same Rust crate compiled as native Axum server
2. Add server mode to `store.ts`
3. Can wait until hidden game support is needed

### Phase E — Cleanup
1. Remove TypeScript engine (`src/engine/solver.ts`, `solver.worker.ts`)
2. Remove TypeScript engine tests (replaced by Rust tests + cross-verification)
3. Keep `board.ts` for client-side rendering

## Risks

1. **WASM performance is unverified.** The 20× speedup estimate is based on typical
   Rust-to-WASM benchmarks, not our specific solver. If actual speedup is only 10×,
   turn 1 would be ~18s (50 sims / 4 workers × 1.4s) — still within budget but tighter.
   Benchmark early with a minimal Rust prototype.

2. **Engine port correctness.** Board capture rules (Plus, Same, Reverse, Fallen Ace,
   Ascension, Descension, combos) are intricate. The cross-language test harness is
   critical. Property-based testing catches edge cases hand-written tests miss.

3. **WASM threading.** Web Workers with WASM require `Cross-Origin-Opener-Policy` and
   `Cross-Origin-Embedder-Policy` headers. Self-hosted users control their headers,
   so this is manageable but must be documented.

4. **In-place mutation changes solver architecture.** The TypeScript solver uses immutable
   state copies. The Rust solver uses mutation + undo. Different code structure means the
   port is a rewrite, not a transliteration. Cross-verification is the safety net.
