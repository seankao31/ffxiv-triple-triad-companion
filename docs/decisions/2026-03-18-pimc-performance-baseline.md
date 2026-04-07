# PIMC Performance Baseline

**Date:** 2026-03-18

Measured using the 10-distinct-card opening position (same cards as the WASM PIMC benchmark in `tests/bench/`).

## Native release (single sim)

- `find_best_move()` with fresh 4M-entry TT
- Time: ~5.3s (5,310,466µs)

## WASM release (50 sims, sequential)

- `wasm_simulate()` × 50, sequential
- Total: ~276s; Per sim: ~5524ms

## Native server (50 sims, Rayon parallel)

- `POST /api/solve` with 5 unknown opponent cards, `simCount: 50`
- Wall-clock: ~47s
- CPU cores: 12
- Effective parallelism: ~5.6× speedup vs. expected sequential time (~265s)

## Key Insights

- **WASM JIT is efficient for compute-bound workloads.** Per-sim WASM time (~5.5s) is close to native single-sim time (~5.3s). The WASM overhead is minimal for this kind of tight numeric loop.
- **Rayon parallelism is sub-linear due to memory pressure.** Each simulation allocates a fresh 4M-entry TT (~64MB). With 12 cores, peak allocation would be ~768MB. The actual ~5.6× speedup (vs. theoretical 12×) suggests that memory bandwidth and allocation pressure limit scaling beyond ~6 concurrent threads.
