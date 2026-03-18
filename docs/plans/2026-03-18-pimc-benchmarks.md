# PIMC Release-Mode Benchmarks

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure actual PIMC performance in release mode (WASM and native server), then add assertions that catch regressions.

**Background:** The only existing PIMC timing is `tests/engine/solver.wasm.test.ts` — 50 sims in 287s in *debug* WASM (5.75s/sim). This is a "recording checkpoint": no assertion, always passes. We have no release-mode numbers for PIMC, only for single-sim minimax (native release: 9.3s; WASM release: 8.2s, opening position, 10 distinct cards). The PIMC cards in the benchmark may differ in complexity.

**What "recording checkpoint" means:** The test runs and prints timing to stdout but makes no `expect()` assertion — it can never fail. It tells you a number but won't catch a regression. The goal here is to add real assertions once we know the baseline.

---

## Task 1: Add a Rust PIMC benchmark with release-mode assertion

**Files:**
- Modify: `engine-rs/src/solver.rs` (benchmark at end of test module)
- Note: `wasm_simulate` is the WASM entry point; the equivalent Rust function is in `src/lib.rs`. The core PIMC loop is in `src/pimc.rs`.

The native server runs PIMC with Rayon parallelism. To benchmark single-sim throughput (the unit that matters for WASM), benchmark a single call to the core minimax solver with a fresh TT — the same operation `wasm_simulate` does.

- [ ] **Step 1: Read `engine-rs/src/lib.rs` to find `wasm_simulate` and understand what it calls**

  ```bash
  grep -n "wasm_simulate\|fn simulate\|find_best_move\|pimc" engine-rs/src/lib.rs | head -20
  ```

- [ ] **Step 2: Run the existing PIMC benchmark in release mode to get baseline**

  ```bash
  cd engine-rs && cargo test --release benchmark_pimc -- --nocapture 2>/dev/null || \
  cargo test --release pimc -- --nocapture
  ```

  If no PIMC benchmark exists in Rust, proceed to Step 3.

- [ ] **Step 3: Add a Rust PIMC single-sim benchmark**

  In `engine-rs/src/solver.rs` test module, add before the final `}`:

  ```rust
  #[test]
  fn benchmark_pimc_single_sim() {
      // Measures a single PIMC simulation: find_best_move from the PIMC benchmark
      // state (same cards as solver.wasm.test.ts). Each WASM simulation is one call
      // to find_best_move with a fresh TT.
      reset_card_ids();
      let p = vec![
          create_card(4,  8, 8,  1, CardType::None),
          create_card(1,  4, 8,  8, CardType::None),
          create_card(8,  2, 8, 10, CardType::None),
          create_card(8,  2, 3,  8, CardType::None),
          create_card(2,  5, 9,  9, CardType::None),
      ];
      let o = vec![
          create_card(3,  7, 5,  2, CardType::None),
          create_card(8,  3, 9,  6, CardType::None),
          create_card(1,  5, 8,  4, CardType::None),
          create_card(6,  9, 1,  7, CardType::None),
          create_card(3,  2, 4, 10, CardType::None),
      ];
      let state = create_initial_state(p, o, Owner::Player, no_rules());

      let t0 = std::time::Instant::now();
      let moves = find_best_move(&state);
      let elapsed_us = t0.elapsed().as_micros();

      assert!(!moves.is_empty(), "Solver returned no moves");
      println!("PIMC single sim (release): {elapsed_us}µs");
      #[cfg(not(debug_assertions))]
      assert!(
          elapsed_us < 30_000_000,
          "PIMC sim regression: {elapsed_us}µs (>30s). Establish baseline first."
      );
  }
  ```

  **NOTE:** The initial threshold (30s) is intentionally generous — run the benchmark first to establish a real baseline, then tighten the threshold in Step 5.

- [ ] **Step 4: Run the benchmark in release mode to record the baseline**

  ```bash
  cd engine-rs && cargo test --release benchmark_pimc_single_sim -- --nocapture
  ```

  Record the printed elapsed time. This is the native release single-sim baseline.

- [ ] **Step 5: Set a tighter threshold based on the measured baseline**

  Once you have the baseline (e.g., if it's 1.5s), set the assertion to 2× that value for headroom:

  ```rust
  #[cfg(not(debug_assertions))]
  assert!(
      elapsed_us < 3_000_000,  // 3s — 2× the ~1.5s baseline
      "PIMC sim regression: {elapsed_us}µs (>3s). Baseline: ~1.5s native release."
  );
  ```

- [ ] **Step 6: Run in debug mode to confirm the guard works**

  ```bash
  cd engine-rs && cargo test benchmark_pimc_single_sim -- --nocapture
  ```

  Debug mode will be slow (~30–100s) but should not fail.

- [ ] **Step 7: Commit**

  ```bash
  git add engine-rs/src/solver.rs
  git commit -m 'test(engine-rs): PIMC single-sim benchmark with release-mode assertion'
  ```

---

## Task 2: Add WASM PIMC performance test (50 sims, with assertion)

**Files:**
- Modify: `tests/engine/solver.wasm.test.ts`

The existing PIMC benchmark in `solver.wasm.test.ts` uses `// No upper-bound assertion — this is a recording checkpoint`. Convert it to a real gate once we know the expected time.

- [ ] **Step 1: Run the existing WASM PIMC test in isolation to get a release-WASM baseline**

  Build release WASM, then run:
  ```bash
  cd engine-rs && wasm-pack build --target web
  bun test tests/engine/solver.wasm.test.ts --timeout 600000 2>&1 | grep -E "PIMC|pass|fail"
  ```

  Record the printed time per sim (`totalMs / 50`).

- [ ] **Step 2: Add an assertion to the WASM PIMC benchmark**

  In `tests/engine/solver.wasm.test.ts`, find the PIMC benchmark test and replace the comment:

  ```typescript
  // No upper-bound assertion — this is a recording checkpoint
  ```

  with a real assertion (using the measured baseline × 3 for generous headroom):

  ```typescript
  // Each WASM sim is a full minimax solve from the opening position.
  // Baseline: ~Xms/sim (release WASM). Threshold: X×3 to catch regressions.
  expect(perSimMs).toBeLessThan(/* measured_baseline * 3 */);
  ```

  Fill in the measured baseline from Step 1.

- [ ] **Step 3: Run to confirm the assertion passes**

  ```bash
  bun test tests/engine/solver.wasm.test.ts --timeout 600000 2>&1 | tail -5
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add tests/engine/solver.wasm.test.ts
  git commit -m 'test: add WASM PIMC performance assertion (convert recording checkpoint to gate)'
  ```

---

## Task 3: Benchmark the native server PIMC (Rayon parallel, 50 sims)

**Files:**
- Read: `engine-rs/src/pimc.rs` (understand the parallel structure)
- Optionally modify: `engine-rs/src/pimc.rs` or `engine-rs/src/bin/server.rs`

The server PIMC uses Rayon to run simulations in parallel. Parallelism makes the 50-sim wall-clock time much less than 50× the single-sim time. This task measures actual server throughput.

- [ ] **Step 1: Build and start the native server**

  ```bash
  cd engine-rs && cargo build --release --features server --bin server
  ./target/release/server &
  SERVER_PID=$!
  ```

- [ ] **Step 2: POST a PIMC request and measure wall-clock time**

  Use the same state as the WASM benchmark (all 5 opponent cards unknown). The server should run 50 simulations in parallel.

  ```bash
  STATE_JSON='{"board":[null,null,null,null,null,null,null,null,null],"playerHand":[{"id":0,"top":4,"right":8,"bottom":8,"left":1,"type":"none"},{"id":1,"top":1,"right":4,"bottom":8,"left":8,"type":"none"},{"id":2,"top":8,"right":2,"bottom":8,"left":10,"type":"none"},{"id":3,"top":8,"right":2,"bottom":3,"left":8,"type":"none"},{"id":4,"top":2,"right":5,"bottom":9,"left":9,"type":"none"}],"opponentHand":[null,null,null,null,null],"currentTurn":"player","rules":{"plus":false,"same":false,"reverse":false,"fallenAce":false,"ascension":false,"descension":false}}'

  time curl -s -X POST http://127.0.0.1:8080/api/solve \
    -H 'Content-Type: application/json' \
    -d "$STATE_JSON" | head -c 200
  ```

  Record wall-clock time from `time`.

- [ ] **Step 3: Stop the server**

  ```bash
  kill $SERVER_PID
  ```

- [ ] **Step 4: Record results in a decision doc**

  Create `docs/decisions/2026-03-18-pimc-performance-baseline.md` with:
  - Native release single-sim: from Task 1
  - WASM release 50-sim total: from Task 2
  - Native server 50-sim wall-clock: from Task 3
  - CPU core count on the test machine

---

## Execution Order

1. Task 1 (Rust benchmark) — establishes native single-sim baseline
2. Task 2 (WASM assertion) — uses WASM timing to set the gate
3. Task 3 (server throughput) — documents parallel speedup

After all tasks:
```bash
cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark
bun test tests/engine/solver.wasm.test.ts --timeout 600000
```
