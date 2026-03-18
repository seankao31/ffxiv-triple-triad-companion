# PIMC Performance Baseline

Measured on 2026-03-18. All measurements use the 10-distinct-card opening position
(same cards as solver.wasm.test.ts PIMC benchmark).

## Native release (single sim)
- find_best_move() with fresh 4M TT
- Time: ~5.3s (5,310,466µs)

## WASM release (50 sims, sequential)
- wasm_simulate() × 50, sequential
- Total: ~276s; Per sim: ~5524ms

## Native server (50 sims, Rayon parallel)
- POST /api/solve with unknownCardIds: [5,6,7,8,9] and simCount: 50
- Wall-clock: ~47s
- CPU cores: 12
- Effective parallelism: ~5.6× speedup vs 50 sequential single-sim runs (~265s expected sequential)

## Notes
- WASM per-sim is close to native single-sim: WASM JIT is efficient for this compute-bound workload
- Server Rayon parallelism achieves ~5.6× speedup on 12 cores (sub-linear: each sim allocates a
  fresh 4M-entry TT, creating memory pressure that limits scaling beyond ~6 concurrent threads)
