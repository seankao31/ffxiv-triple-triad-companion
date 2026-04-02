# Benchmark Separation

## Problem

Absolute timing thresholds in the regular test suite (e.g., `expect(elapsed).toBeLessThan(16572)`)
are machine-dependent and flaky under load. They only catch catastrophic regressions due to
generous margins, and add 5–10 minutes of wall time to every test run.

## Decision

Partition tests by what they measure:

- **Correctness tests** — always run
- **Algorithmic property tests** (ratio-based, e.g., "warm TT is 10× faster") — always run
- **Absolute performance benchmarks** — on-demand only

### Rust

Three benchmarks (`benchmark_flat_array_tt`, `benchmark_mutation_speedup`, `benchmark_pimc_single_sim`)
were consolidated into two `#[ignore]` tests with no absolute assertions:

- `benchmark_opening_position` — opening-position solve with 10 distinct cards
- `benchmark_pimc_single_sim` — single PIMC simulation

Run on demand: `cargo test --release -- --ignored`

### WASM

Two heavy tests (PIMC 50-sim, opening position solve) moved from `tests/engine/solver.wasm.test.ts`
to `tests/bench/solver.wasm.bench.ts`. No absolute timing assertions — print-only.

Run on demand: `bun run bench:wasm`

### What stayed in the regular suite

Ratio-based TT reuse tests (`secondMs * 10 < firstMs + 1`) remain — they test algorithmic
invariants independent of hardware speed.

## Future: Criterion.rs

The current `#[ignore]` benchmarks print timing for manual inspection but have no automated
regression detection. [Criterion.rs](https://github.com/bheisler/criterion.rs) could add
statistical comparison against stored baselines with confidence intervals and HTML reports.

Not planned yet — low priority while the solver algorithm is stable. Revisit if we start
making frequent solver changes (e.g., deck optimizer work).
