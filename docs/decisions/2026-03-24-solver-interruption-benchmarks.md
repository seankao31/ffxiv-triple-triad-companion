# Solver Interruption Benchmarks

Date: 2026-03-24

## Context

When a user plays a card or undoes during an in-progress solve, the new solve queues
behind the old one. The current implementation uses a generation counter to discard stale
results, but the WASM worker continues computing until finished. We need data to decide
whether to add true cancellation (e.g., `worker.terminate()` + respawn).

## Test Games

| Game | Cards (T-R-B-L) | Rules |
|------|-----------------|-------|
| **A** | P: 10-5-3-8, 7-6-4-9, 2-8-6-3, 5-4-7-1, 9-3-2-6 / O: 4-7-5-2, 8-3-9-6, 1-5-8-4, 6-9-1-7, 3-2-4-A | None |
| **B** | Same cards as Game A | Plus |
| **C** | P & O identical: 4-8-8-1, 1-4-8-8, 8-2-8-A, 8-8-1-8, 8-2-3-8 | Plus |

All games start from the opening position (empty board, player first, 10 distinct card IDs).

## Results

### WASM (Bun, release build)

| Game | Turn 1 (scratch) | Turn 2 (TT reuse) | Turn 2 (scratch) | PIMC sim (opening) |
|------|------------------|--------------------|-------------------|--------------------|
| A    | 13.54s           | 910ms              | 1.41s             | 13.73s             |
| B    | 24.62s           | 2.19s              | 2.81s             | 24.61s             |
| C    | 20.76s           | 1.83s              | 2.66s             | 20.93s             |

- **WASM `initSync`** (with pre-loaded bytes): **5.4ms**
- TT entries after turn-1 solve: ~4.1M (near the 4M TT cap in all games)

### Native Server (release build, localhost)

| Game | Turn 1 | Turn 2 |
|------|--------|--------|
| A    | 12.85s | 1.33s  |
| B    | 20.60s | 2.34s  |
| C    | 17.70s | 2.22s  |

Server is stateless — every request creates a fresh TT. Times include localhost round-trip.

## Key Findings

1. **Plus rule roughly doubles solve time** compared to no rules (Game A vs B).

2. **TT reuse gives ~1.5x speedup for turn-2**, not the ~200x previously documented.
   The 200x figure was measured by re-solving the *same* position (a TT cache hit),
   not advancing to the next turn's position (a different search tree with partial TT overlap).

3. **Turn-2 from scratch is 1.4–2.8s** across all games. The search tree after one move
   is dramatically smaller than the opening position regardless of TT state.

4. **WASM `initSync` is 5.4ms** — negligible cost for worker respawn.

5. **PIMC per-sim cost equals turn-1 cost** (fresh TT each sim by design).

6. **Native server is ~15–20% faster than WASM** for the same solve, as expected.

## Implications for Interruption Design

The data answers the central question: if we kill a worker mid-turn-1 and respawn for
turn-2, what do we lose?

| Scenario | Wait with queuing (current) | Wait with termination |
|----------|----------------------------|-----------------------|
| User plays during turn-1 (Game A) | ~13.5s (stale solve finishes) + ~0.9s = **~14.4s** | 5ms (init) + 1.4s (turn-2 scratch) = **~1.4s** |
| User plays during turn-1 (Game B) | ~24.6s + ~2.2s = **~26.8s** | 5ms + 2.8s = **~2.8s** |
| User undoes during PIMC (50 sims) | Up to **~25s** of queued stale sims | 5ms × 4 workers + new sims |

The cost of TT loss (turn-2 scratch vs TT reuse) is 500ms–620ms. The cost of *not*
terminating is 13–25s of wasted wait time.

## Benchmark Scripts

- `benchmarks/wasm-solve-timing.ts` — Games A and B on WASM
- `benchmarks/server-solve-timing.ts` — Games A and B on native server
- `benchmarks/identical-hands-timing.ts` — Game C on both WASM and server

Run instructions in each file's header comment.
