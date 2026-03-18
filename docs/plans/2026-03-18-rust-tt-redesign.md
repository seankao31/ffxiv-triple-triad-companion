# Rust TT Size and Replacement Policy Investigation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Understand why the TT was reduced from 4M to 128K entries, determine if the cap is necessary, and fix the replacement policy if a cap is unavoidable.

**Background:** The original Rust TT was `1 << 22` (4M entries, 64MB at 16 bytes/entry). Commit `74df18b` reduced it to `1 << 17` (128K entries, 2MB) with comment "Sufficient coverage for mid-game transpositions while keeping WASM heap footprint small." However, the opening-position solve with 10 distinct cards saturates the 128K TT completely, meaning no TT entries survive to the second solve — defeating the purpose of a persistent TT.

**Two problems to investigate:**
1. **Is the 128K cap necessary?** The TS engine uses an unbounded Map (no size cap in Bun/JSC). If the Rust solver can also use an unbounded structure, the cap goes away entirely.
2. **If a cap is unavoidable:** The current replacement policy is "always overwrite" — a new entry replaces whatever was at that hash slot. This evicts root-level entries (which represent the largest subtrees and the most computation) in favor of leaf-level entries. A depth-aware policy should prefer keeping entries closer to the tree root.

---

## Background: TT Architecture

**Current implementation (`engine-rs/src/solver.rs`):**
- Flat array `Vec<TtEntry>` of size `TT_SIZE = 1 << 17` (128K)
- Each entry: `key: u64, value: i32, depth: u8` (16 bytes due to alignment)
- Hash slot: `key % TT_SIZE`
- Replacement: unconditional overwrite
- TT is allocated once in `Solver::new()` and reused across `solve()` calls

**TS implementation (`src/engine/solver.ts`):**
- `Map<number, number>` — unbounded, no eviction
- V8 limit: ~2^24 entries; Bun/JSC: effectively unlimited
- The TS `createSolver` TT reuse test passes because JSC never evicts entries

**What changed and why:**
- Original Rust TT: `1 << 22` (4M entries, 64MB) — mirrors "unbounded" philosophy
- Commit `74df18b` reduced to `1 << 17` (128K, 2MB) — reasoning was "WASM heap footprint"
- No investigation was done into actual WASM heap limits before making this decision

---

## Task 1: Determine WASM heap capacity

**Goal:** Establish whether the WASM heap can support a larger TT without crashing.

- [ ] **Step 1: Check WASM memory model**

  WASM memory starts at a configurable initial size and grows via `memory.grow`. The wasm-pack default initial page count is 17 (1MB). Each page is 64KB. Default max is implementation-defined (browsers typically allow 4GB).

  Run this in a browser or via the WASM test harness to measure actual available heap:
  ```bash
  cd engine-rs && cargo test wasm_memory -- --nocapture 2>/dev/null || true
  ```

  If no memory test exists, check what wasm-pack sets by inspecting the generated `.wasm` file:
  ```bash
  wasm-objdump -h pkg/engine_rs_bg.wasm | grep memory
  ```
  or:
  ```bash
  wasm-opt --print-minified pkg/engine_rs_bg.wasm 2>/dev/null | head -5
  ```

- [ ] **Step 2: Measure TT memory usage at various sizes**

  Current TT entry is `{ key: u64, value: i32, depth: u8 }` = 16 bytes (with padding).

  | TT_SIZE | Entries | Memory |
  |---------|---------|--------|
  | 1 << 17 | 128K    | 2MB    |
  | 1 << 20 | 1M      | 16MB   |
  | 1 << 22 | 4M      | 64MB   |
  | 1 << 24 | 16M     | 256MB  |

  For WASM, 16MB (1M entries) is conservative; 64MB (4M entries) is feasible for desktop browsers. 256MB starts to strain mobile browsers.

- [ ] **Step 3: Determine the number of unique game states**

  Upper bound: `P(9,9) × P(10,10) = 9! × 10!` ≈ 131 billion — way too large.
  In practice: the actual reachable state count is far smaller because the board constrains which cards can be where, and the TT hash collapses many into the same slot.

  Add a counter to `minimax` to measure how many unique hashes are visited during the opening-position solve:
  ```rust
  // Temporary: add an AtomicUsize counter in tests to count unique TT writes
  ```

  This tells us the minimum TT size to avoid any eviction for the opening position.

- [ ] **Step 4: Try TT_SIZE = 1 << 22 (4M, 64MB) with WASM**

  Restore the original size:
  ```rust
  const TT_SIZE: usize = 1 << 22;  // 4M entries, 64MB
  ```

  Rebuild and run the WASM performance test:
  ```bash
  cd engine-rs && wasm-pack build --target web --out-dir ../pkg
  bun test tests/engine/solver.cross.test.ts --timeout 120000 2>&1 | grep -E "WASM|Turn 1|Turn 2|pass|fail"
  ```

  If WASM doesn't crash (OOM): 4M is fine → use this, no replacement policy needed.
  If WASM crashes with OOM: investigate the memory limit and find the largest safe size.

---

## Task 2: Design depth-aware replacement policy (only if cap is unavoidable)

**Only do this task if Task 1 concludes that a size cap is unavoidable.**

**Background:** In minimax, a node at depth D (D empty cells remaining) represents a subtree of size roughly `D!`. Recomputing a depth-9 node (opening position) requires traversing the entire game tree — extremely expensive. Recomputing a depth-1 node (one cell left) is nearly free (it's a leaf). The current "always overwrite" policy evicts high-depth nodes in favor of low-depth nodes — exactly backwards.

**Desired policy:** When a hash collision occurs, keep the entry with higher `depth` (closer to root, more cells remaining, more expensive to recompute). Only evict if the incoming entry has equal or higher depth.

- [ ] **Step 1: Verify `depth` is tracked in TtEntry**

  Check `engine-rs/src/solver.rs` for the `TtEntry` struct. If `depth: u8` is already there but unused for replacement, we just need to use it.

- [ ] **Step 2: Modify the TT write logic**

  In `minimax`, at the TT write site (the `tt[slot]` assignment), change from:
  ```rust
  tt[slot] = TtEntry { key: state_key, value, depth: state.moves_remaining() };
  ```
  to:
  ```rust
  let existing = &tt[slot];
  if existing.key == EMPTY_KEY || incoming_depth >= existing.depth {
      tt[slot] = TtEntry { key: state_key, value, depth: incoming_depth };
  }
  ```

  Where `incoming_depth` = number of empty cells in the current state (higher = closer to root).

- [ ] **Step 3: Write a failing test that verifies depth-aware replacement**

  In `engine-rs/src/solver.rs` test module:
  ```rust
  #[test]
  fn tt_keeps_shallower_entry_on_collision() {
      // If two states hash to the same slot:
      // - First write: depth=7 (3 cards placed)
      // - Second write: depth=3 (7 cards placed, deeper)
      // - TT should still hold the depth=7 entry
      // This tests the replacement policy without needing a real collision.
  }
  ```

  **Note:** Engineering a real hash collision is impractical. Instead, test via observable behavior:
  - After a full opening-position solve, call `solver.tt_size()` and verify it equals TT_SIZE (TT is full)
  - Solve a second time with the same state and measure it's dramatically faster (root-level entry survived)

- [ ] **Step 4: Run tests and verify TT reuse works after replacement policy change**

  ```bash
  cd engine-rs && cargo test --features server -- --skip benchmark
  bun test tests/engine/solver.cross.test.ts --timeout 300000
  ```

  The turn-2 TT reuse test (`WasmSolver: turn-2 solve is at least 10× faster than turn-1`) should now pass.

- [ ] **Step 5: Commit**

  ```bash
  git add engine-rs/src/solver.rs
  git commit -m 'perf(engine-rs): depth-aware TT replacement policy (preserve root entries)'
  ```

---

## Decision Tree

```
Task 1: Can WASM support TT_SIZE = 1 << 22 (4M, 64MB)?
├── YES → Restore TT_SIZE = 1 << 22, rebuild pkg, done. No replacement policy needed.
└── NO (OOM) → Find largest safe TT_SIZE, then do Task 2 (depth-aware replacement).
```

---

## Execution Order

1. Task 1 first — determines whether Task 2 is needed at all
2. Task 2 only if Task 1 shows a size cap is unavoidable
3. After either path: rebuild WASM, run full test suite, run turn-2 TT reuse test

---

## Expected Outcome

After this plan:
- The TT size is justified by measurement, not assumption
- If a cap is in place, the replacement policy is correct (favors root entries)
- The `WasmSolver: turn-2 solve is at least 10× faster than turn-1` test passes
- The WASM opening-position performance test still passes (≤60s)
