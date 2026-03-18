# Rust/WASM Performance Investigation and Benchmarks

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hard performance assertions to Rust benchmarks, investigate why WASM takes 40+ seconds for the opening position (2x slower than TS), and fix the underlying cause.

**Architecture:** The Rust/WASM solver stack has two layers: native Rust (release: 9.3s for opening position — faster than TS's 21s) and WASM in the browser (40+ seconds — slower than TS). The gap between native and WASM (4.3x overhead vs expected 1.5-2x) is unexplained. Investigation should start with Cargo optimization settings, then WASM profiling.

**Tech Stack:** Rust (solver.rs, Cargo.toml), wasm-pack, TypeScript (solver.cross.test.ts), Bun

---

## Context: What Performance Tests Exist Today

**TS engine:** `tests/engine/solver.test.ts` — `describe("solver performance")` — asserts opening position solve < 25s. Uses cards: player=(10,5,3,8),(7,6,4,9),(2,8,6,3),(5,4,7,1),(9,3,2,6) vs opponent=(4,7,5,2),(8,3,9,6),(1,5,8,4),(6,9,1,7),(3,2,4,10).

**Rust native:** `engine-rs/src/solver.rs` — `benchmark_flat_array_tt` and `benchmark_mutation_speedup` — use the **same 10 cards** as the TS test, run `find_best_move` on opening position. Result in release mode: **~9.3s**. BUT: **no upper-bound assertion** (comment: "No upper-bound assertion — this is a recording checkpoint, not a speed gate"). These tests do not run with `--release` by default.

**WASM:** No performance test exists whatsoever.

**The symptom:** User reports first turn takes 40+ seconds in the browser. This is:
- 4.3× slower than native Rust (9.3s)
- 2× slower than TS (21s)
- Normal WASM overhead is 1.5–2× native, so expected WASM time ≈ 14–19s.

The 40s behavior may have been with the old `wasm_solve` code (allocates 128K TT every call). After this session's `WasmSolver` fix, first-turn allocation overhead is gone. But even without allocation, WASM overhead may still be higher than expected.

---

## Task 1: Add assertion to native Rust benchmark

**Files:**
- Modify: `engine-rs/src/solver.rs` (benchmark_flat_array_tt, benchmark_mutation_speedup)

This task converts the recording-only benchmarks into actual performance gates. Run in release mode only — debug mode (~113s) is not a valid benchmark target.

- [ ] **Step 1: Add release-mode guard and assertion to benchmark_flat_array_tt**

In `engine-rs/src/solver.rs`, find `benchmark_flat_array_tt` (~line 738). Change from:

```rust
println!("Flat-array TT solve: {elapsed_us}µs ({} moves)", moves.len());
```

To:

```rust
println!("Flat-array TT solve: {elapsed_us}µs ({} moves)", moves.len());
// Release-mode gate: native solver must be faster than TS (~21s).
// Skip assertion in debug builds (can be 10x–50x slower).
#[cfg(not(debug_assertions))]
assert!(
    elapsed_us < 15_000_000,
    "Performance regression: opening position took {elapsed_us}µs (>15s). TS baseline ~21s."
);
```

- [ ] **Step 2: Apply same guard to benchmark_mutation_speedup**

Same change to `benchmark_mutation_speedup` (~line 761).

- [ ] **Step 3: Run benchmarks in release mode to confirm they pass**

```bash
cd engine-rs && cargo test --release benchmark -- --nocapture
```

Expected output: prints elapsed time ~9s, no assertion failure.

- [ ] **Step 4: Run benchmarks in debug mode to confirm they don't fail**

```bash
cd engine-rs && cargo test benchmark -- --nocapture
```

Expected: prints elapsed time ~100s, no assertion failure (guard is skipped in debug builds).

- [ ] **Step 5: Commit**

```bash
git add engine-rs/src/solver.rs
git commit -m 'test(engine-rs): add performance assertions to benchmarks (release-mode only)'
```

---

## Task 2: Add WASM performance test in cross-verification suite

**Files:**
- Modify: `tests/engine/solver.cross.test.ts`

Measure actual WASM execution time using the same 10-card opening position as the TS and Rust benchmarks. This test will catch WASM performance regressions and quantify the actual overhead.

- [ ] **Step 1: Write the failing WASM performance test**

In `tests/engine/solver.cross.test.ts`, add after the 1000-state property test (before `// --- WasmSolver persistent TT ---`):

```typescript
// --- WASM performance ---

it('wasm_solve completes opening position within 60 seconds', () => {
  // Same 10-card set as TS performance test and Rust benchmarks.
  // Asserts WASM overhead is not catastrophically worse than TS (~21s).
  // Using WasmSolver (persistent TT) so first-turn TT allocation happens once.
  const p = [
    { id: 0, top: 10, right: 5, bottom: 3, left: 8,  type: CardType.None },
    { id: 1, top: 7,  right: 6, bottom: 4, left: 9,  type: CardType.None },
    { id: 2, top: 2,  right: 8, bottom: 6, left: 3,  type: CardType.None },
    { id: 3, top: 5,  right: 4, bottom: 7, left: 1,  type: CardType.None },
    { id: 4, top: 9,  right: 3, bottom: 2, left: 6,  type: CardType.None },
  ];
  const o = [
    { id: 5, top: 4,  right: 7, bottom: 5, left: 2,  type: CardType.None },
    { id: 6, top: 8,  right: 3, bottom: 9, left: 6,  type: CardType.None },
    { id: 7, top: 1,  right: 5, bottom: 8, left: 4,  type: CardType.None },
    { id: 8, top: 6,  right: 9, bottom: 1, left: 7,  type: CardType.None },
    { id: 9, top: 3,  right: 2, bottom: 4, left: 10, type: CardType.None },
  ];
  const state: GameState = {
    board: [null, null, null, null, null, null, null, null, null] as unknown as Board,
    playerHand: p,
    opponentHand: o,
    currentTurn: Owner.Player,
    rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
  };

  const solver = new WasmSolver();
  const t0 = performance.now();
  const moves: WasmMove[] = JSON.parse(solver.solve(JSON.stringify(state)));
  const elapsed = performance.now() - t0;
  solver.free();

  expect(moves.length).toBe(45); // 5 cards × 9 positions
  console.log(`WASM opening position solve: ${elapsed.toFixed(0)}ms`);
  expect(elapsed).toBeLessThan(60_000); // 60s — generous bound; expected ~20-30s
}, 90_000);
```

- [ ] **Step 2: Run the test to see the actual time**

```bash
bun test tests/engine/solver.cross.test.ts --timeout 120000 2>&1 | grep -E "pass|fail|WASM opening|ms"
```

Note the elapsed time printed. If it's >60s, the test will fail — that's the point: we now have a regression detector.

- [ ] **Step 3: Commit regardless of pass/fail**

If the test fails (>60s), that's valuable data — commit it as a known failure to investigate.

```bash
git add tests/engine/solver.cross.test.ts
git commit -m 'test: add WASM opening-position performance test (60s bound)'
```

---

## Task 3: Investigate and fix WASM overhead

**Files:**
- Modify: `engine-rs/Cargo.toml`

**Context:** Normal WASM overhead is 1.5–2× native. If native is 9.3s, WASM should be ~14–19s. At 40s it's 4.3× — something is sub-optimal. The first place to look is Cargo optimization settings.

**Current Cargo.toml:** Has no `[profile.release]` section. Default release uses `opt-level = 3, codegen-units = 16`. Adding `lto = "thin"` and `codegen-units = 1` enables cross-crate inlining and reduces codegen unit fragmentation — known to improve WASM output by 15–40%.

- [ ] **Step 1: Check if performance test from Task 2 already passes**

If the Task 2 test showed elapsed < 30s, the current build is already acceptable. Still add the Cargo settings (they're free wins). If elapsed > 30s, this task is blocking.

- [ ] **Step 2: Add WASM optimization settings to Cargo.toml**

Add to the end of `engine-rs/Cargo.toml`:

```toml
[profile.release]
# Enable link-time optimization for better WASM output.
# "thin" is much faster than "fat" LTO and still improves WASM by ~15-30%.
lto = "thin"
# Single codegen unit: slower compile, better inlining across functions.
codegen-units = 1
```

- [ ] **Step 3: Rebuild the WASM module**

```bash
cd engine-rs && wasm-pack build --target web --out-dir ../pkg
```

The rebuild will take longer (LTO + single codegen unit). This is expected.

- [ ] **Step 4: Re-run the WASM performance test**

```bash
bun test tests/engine/solver.cross.test.ts --timeout 120000 2>&1 | grep -E "pass|fail|WASM opening|ms"
```

Expected: elapsed time should drop by 15–30% vs before.

- [ ] **Step 5: Run all tests to verify nothing is broken**

```bash
bun test tests/engine/solver.cross.test.ts && bunx vitest run
```

Expected: all 8 cross-verification tests pass, 111 UI tests pass.

- [ ] **Step 6: If WASM is still >30s, investigate TT size**

The flat-array TT has 128K entries (`TT_SIZE = 1 << 17`). With 10 distinct cards and millions of unique game positions, the TT collision rate may be high, causing repeated re-evaluation of subtrees.

To investigate: in `engine-rs/src/solver.rs`, temporarily add a counter that tracks TT hit rate and print it from the benchmark. If hit rate < 30% for the opening position, increasing TT_SIZE to `1 << 18` (256K, 4MB) or `1 << 19` (512K, 8MB) would help.

**Try increasing TT_SIZE:**

In `engine-rs/src/solver.rs`, change:
```rust
const TT_SIZE: usize = 1 << 17;  // 128K entries, ~2MB
```
to:
```rust
const TT_SIZE: usize = 1 << 19;  // 512K entries, ~8MB
```

Rebuild and measure. If it's significantly faster (>2× speedup), keep it. If not (<20% speedup), revert (the memory cost isn't worth it).

- [ ] **Step 7: Commit the final Cargo.toml + TT_SIZE decision**

```bash
git add engine-rs/Cargo.toml engine-rs/src/solver.rs engine-rs/pkg/
git commit -m 'perf(engine-rs): add LTO + codegen-units=1 for better WASM output'
# or if TT_SIZE was increased:
git commit -m 'perf(engine-rs): LTO optimization + increase TT_SIZE to 512K for better hit rate'
```

---

## Task 4: Second-turn TT reuse test (WASM layer)

**Files:**
- Modify: `tests/engine/solver.cross.test.ts`

The WasmSolver fix in this session ensures TT reuse across turns. This test verifies that turn-2 WASM performance is dramatically faster than turn 1 (same behavior as TS `createSolver`).

- [ ] **Step 1: Write the failing second-turn speedup test**

Add inside `describe('cross-verification: TypeScript vs WASM solver', ...)`:

```typescript
it('WasmSolver: turn-2 solve is at least 10× faster than turn-1 (warm TT)', () => {
  // Use the same 10-card opening position as the performance test.
  // Turn 1: cold TT, full search.
  // Turn 2 (same state): TT fully warm, should be near-instant.
  const p = [
    { id: 0, top: 10, right: 5, bottom: 3, left: 8,  type: CardType.None },
    { id: 1, top: 7,  right: 6, bottom: 4, left: 9,  type: CardType.None },
    { id: 2, top: 2,  right: 8, bottom: 6, left: 3,  type: CardType.None },
    { id: 3, top: 5,  right: 4, bottom: 7, left: 1,  type: CardType.None },
    { id: 4, top: 9,  right: 3, bottom: 2, left: 6,  type: CardType.None },
  ];
  const o = [
    { id: 5, top: 4,  right: 7, bottom: 5, left: 2,  type: CardType.None },
    { id: 6, top: 8,  right: 3, bottom: 9, left: 6,  type: CardType.None },
    { id: 7, top: 1,  right: 5, bottom: 8, left: 4,  type: CardType.None },
    { id: 8, top: 6,  right: 9, bottom: 1, left: 7,  type: CardType.None },
    { id: 9, top: 3,  right: 2, bottom: 4, left: 10, type: CardType.None },
  ];
  const state: GameState = {
    board: [null, null, null, null, null, null, null, null, null] as unknown as Board,
    playerHand: p,
    opponentHand: o,
    currentTurn: Owner.Player,
    rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
  };

  const solver = new WasmSolver();
  const t0 = performance.now();
  solver.solve(JSON.stringify(state));
  const firstMs = performance.now() - t0;

  const t1 = performance.now();
  solver.solve(JSON.stringify(state));
  const secondMs = performance.now() - t1;
  solver.free();

  console.log(`Turn 1: ${firstMs.toFixed(0)}ms, Turn 2 (warm TT): ${secondMs.toFixed(0)}ms`);
  // Same as TS createSolver test: second call should be dramatically faster.
  expect(secondMs * 10).toBeLessThan(firstMs + 1);
}, 300_000);
```

- [ ] **Step 2: Run to confirm pass**

```bash
bun test tests/engine/solver.cross.test.ts --timeout 300000 2>&1 | grep -E "pass|fail|Turn 1|Turn 2"
```

Expected: PASS with Turn 2 showing near-0ms.

- [ ] **Step 3: Commit**

```bash
git add tests/engine/solver.cross.test.ts
git commit -m 'test: verify WasmSolver turn-2 TT reuse gives 10× speedup'
```
