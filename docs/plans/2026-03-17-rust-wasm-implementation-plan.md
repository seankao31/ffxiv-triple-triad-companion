# Rust/WASM Solver — Implementation Plan

Parent design: `docs/plans/2026-03-17-rust-wasm-solver-design.md`

## Overview

Port the 818-line TypeScript engine (`types.ts`, `board.ts`, `solver.ts`, `pimc.ts`) to Rust,
targeting WASM (default in-browser) and native (optional server). Each step below is scoped
to fit in a single conversation session.

## Conversation Boundaries

Each step ends with: working code, passing tests, git commit. The design doc and memory
carry context between sessions. At the start of each session, read:
1. This plan (current step)
2. The design doc (`2026-03-17-rust-wasm-solver-design.md`)
3. Memory entries for any gotchas from prior steps

---

## Step 1: Rust crate scaffold + types

**Goal:** Set up `engine-rs/` crate with Cargo.toml, basic project structure, and port
`types.ts` (178 lines) to `types.rs`.

**What to port:**
- `CardType` enum (None, Primal, Scion, Society, Garlean)
- `Owner` enum (Player, Opponent)
- `Card` struct (id, top, right, bottom, left, type)
- `PlacedCard` struct (card ref, owner)
- `Board` type (9-element array of `Option<PlacedCard>`)
- `RuleSet` struct (plus, same, reverse, fallen_ace, ascension, descension)
- `GameState` struct (board, player_hand, opponent_hand, current_turn, rules)
- `Outcome` enum (Win, Draw, Loss)
- `RankedMove` struct (card, position, outcome, robustness, confidence)
- `Neighbor` struct and `ADJACENCY` constant (static lookup table)
- `create_card`, `create_initial_state`, `get_score` functions

**Key Rust decisions:**
- Use `u8` for card stats (1–10), `u8` for position (0–8)
- `Card` is `Copy` (small, no heap). `id: u8` (0–14 range per design)
- `GameState` owns its data (board array, hand `Vec<Card>`) for in-place mutation later
- `ADJACENCY` as `const` static array

**Tests:**
- Unit tests in `engine-rs/src/types.rs` for `create_card`, `get_score`
- Verify `ADJACENCY` matches TypeScript (spot-check corners, center, edges)

**Verification:** `cargo test` passes. Compare `ADJACENCY` output against TypeScript.

**Commit and end session.**

---

## Step 2: Board logic — basic placement (no capture rules)

**Goal:** Port the skeleton of `board.ts` (213 lines) — `place_card` function with standard
capture only. No Plus, Same, Combo, Ascension, Descension, Reverse, or Fallen Ace yet.

**What to port:**
- `place_card(state, card, position) -> GameState` — immutable version first (returns new
  state). We'll convert to in-place mutation in a later step.
- Standard capture: for each neighbor, if opponent-owned and attacker > defender, flip.
- Hand removal: remove the played card from the current player's hand.
- Turn alternation.

**Tests:**
- Port the basic board tests from `tests/engine/board.test.ts`:
  - Card placement on empty board
  - Simple capture (higher value wins)
  - No capture (lower value loses)
  - Multiple captures from one placement
  - Hand size decreases after play
  - Turn alternates
- JSON test fixtures: extract these test cases to `.json` files that both TypeScript and
  Rust can consume.

**Verification:** `cargo test` passes. JSON fixture results match TypeScript.

**Commit and end session.**

---

## Step 3: Board logic — capture rules

**Goal:** Port all capture rules from `board.ts`: Plus, Same, Combo cascade, Reverse,
Fallen Ace, Ascension, Descension. This is the most intricate step.

**What to port:**
- `apply_stat_mod()` — Ascension (Primal +ascCount, cap 10) and Descension (Scion -descCount, floor 1)
- `captures()` — standard, Reverse, Fallen Ace (1↔10 interactions)
- `resolve_plus()` — sum-pair matching, flip opponent cards in groups ≥ 2
- `resolve_same()` — value-pair matching, flip opponent cards with ≥ 2 equal pairs
- `resolve_combo()` — BFS cascade from Plus/Same flips, standard captures only
- Integration in `place_card`: ascCount/descCount snapshot before placement, resolve
  Plus → Same → Combo → Standard capture (in that order)

**Tests:**
- Port ALL capture rule tests from `tests/engine/board.test.ts` (38 tests):
  - Plus rule (basic, with wall, multi-sum)
  - Same rule (basic, with wall)
  - Combo cascade (Plus→Combo, Same→Combo)
  - Reverse (inverted capture)
  - Fallen Ace (1 captures 10, 10 captures 1, with/without Reverse)
  - Ascension/Descension (stat modifiers, cap/floor, Primal/Scion types)
  - Rule combinations (Plus+Reverse, Same+Fallen Ace, etc.)
- Extend JSON test fixtures for all capture rule cases.

**Verification:** All 38 board test equivalents pass in Rust. JSON fixture cross-check
against TypeScript output matches exactly.

**Commit and end session.**

---

## Step 4: Solver — minimax with alpha-beta and TT

**Goal:** Port `solver.ts` (255 lines) to Rust. This is the performance-critical code.

**What to port:**
- `stats_key()` — card deduplication hash
- `hash_state()` — board+turn encoding (46-bit polynomial)
- `board_full()` — terminal check
- `terminal_value()` — score evaluation
- `TTEntry` struct, `TTFlag` enum
- `TranspositionTable` — flat array with open addressing, always-replace policy
- `minimax()` — alpha-beta with TT lookup/insert, card deduplication
- `find_best_move_with()` — first pass (evaluate all moves) + second pass (robustness)
- `find_best_move()` — convenience wrapper (fresh TT)
- `Solver` struct with `reset()`, `solve()`, `tt_size()`

**Key Rust decisions:**
- `TranspositionTable`: `Vec<TTEntry>` with power-of-2 size, `key & mask` for indexing.
  Start with 2^20 (1M) initial allocation, grow if needed (or use HashMap initially for
  correctness, optimize to flat array after verification).
- `minimax` takes `&mut GameState` — but we're still using immutable copies in this step
  (mutation comes in Step 5). Get correctness first.

**Tests:**
- Port solver tests from `tests/engine/solver.test.ts`:
  - Basic solve (trivial positions)
  - Win/draw/loss detection
  - TT reuse across turns (persistent solver)
  - Card deduplication (identical cards don't cause redundant search)
  - Hash encoding correctness
- JSON test fixtures for solver: `{input_state, expected_ranked_moves}`.

**Verification:** `cargo test` passes. Solver output matches TypeScript for all fixture
inputs (same cards recommended, same outcomes). TT hash values match between languages.

**Commit and end session.**

---

## Step 5: In-place mutation optimization

**Goal:** Convert `place_card` from immutable (returns new state) to in-place mutation with
undo. This is the primary performance optimization.

**What to implement:**
- `UndoRecord` struct: captures all state changes from one `place_card` call
  - Which card was placed and where
  - Which cells changed owner (from captures)
  - Which card was removed from which hand
  - Previous turn value
- `place_card_mut(state: &mut GameState, card_idx: usize, position: usize) -> UndoRecord`
- `undo_place(state: &mut GameState, undo: UndoRecord)`
- Update `minimax` and `find_best_move_with` to use `place_card_mut` + `undo_place`
  instead of creating new state copies.

**Tests:**
- All existing tests must still pass (same results, different internal path).
- New test: `place_card_mut` followed by `undo_place` returns state to exact original.
- Benchmark: run the same solver test case with immutable vs mutable. Record speedup.
  This gives us the first real Rust performance number.

**Verification:** All tests pass. Benchmark results recorded. Compare solver output
against TypeScript fixtures — must still match exactly.

**Commit and end session.**

---

## Step 6: WASM build pipeline + basic integration

**Goal:** Compile the Rust engine to WASM, load it in the Svelte app, and run a basic
solve from the browser.

**What to implement:**
- `wasm-bindgen` exports in `lib.rs`:
  - `wasm_solve(state_json: &str) -> String` — takes JSON game state, returns JSON
    ranked moves. JSON serialization at the boundary keeps the WASM API simple.
  - (Later optimization: use `serde-wasm-bindgen` for zero-copy if JSON overhead matters.)
- `wasm-pack build --target web` build step
- Vite configuration to load `.wasm` module
- New `solver-wasm.worker.ts`: Web Worker that loads the WASM module and handles
  `solve` messages by calling `wasm_solve`.
- Temporary test page or manual verification: load the app, trigger a solve, confirm
  WASM returns results.

**Tests:**
- `cargo test` still passes (Rust tests unaffected by wasm-bindgen annotations).
- Manual browser test: open app, enter cards, verify solver returns moves.
- Compare WASM solver output against TypeScript solver output for the same input.

**Verification:** WASM module loads in browser. Solve produces correct results.

**Commit and end session.**

---

## Step 7: WASM worker pool for PIMC

**Goal:** Replace the TypeScript PIMC worker pool with WASM workers. This resolves the
original TT memory crash.

**What to implement:**
- `wasm_simulate(state_json: &str, sampled_opponent_json: &str) -> String` — WASM export
  that runs one PIMC simulation (creates fresh solver, runs minimax, returns top move).
- Update `solver-wasm.worker.ts` to handle both `solve` and `simulate` messages.
- Update `store.ts`:
  - `triggerWasmSolve()` — routes All Open solves to 1 dedicated WASM worker
  - `triggerWasmPIMC()` — routes Three Open solves to 4 WASM worker pool
  - PIMC orchestration stays in TypeScript (sampling, star budgets, aggregation)
  - Reuse existing `pimcProgress`, `pimcTally`, `solverLoading` stores
- Remove old TypeScript `solver.worker.ts` usage for PIMC path (keep for fallback
  during testing if needed).

**Tests:**
- All 107 UI tests must pass (they mock workers — verify mock interface matches new worker).
- Manual test with real cards: enter the example deck (4-8-8-1, 1-4-8-8, 8-2-8-A,
  8-2-3-8, 2-5-9-9) in Three Open mode. Verify solver returns results without crashing.
- **Benchmark turn 1 with real cards.** This validates the 20× speedup estimate. Record
  the actual per-simulation time and total wall clock.

**Verification:** Three Open PIMC works in browser. No memory crash. Performance recorded.

**Commit and end session.**

---

## Step 8: Comprehensive cross-verification

**Goal:** Systematic verification that Rust and TypeScript engines produce identical results
for all known test cases, plus property-based random testing.

**What to implement:**
- Cross-verification test harness:
  - Script that runs both TypeScript (`bun`) and Rust (`cargo`) solvers on the same JSON
    fixtures and diffs the output.
  - Covers: all 38 board tests, all 25 solver tests, all PIMC sampling tests.
- Property-based testing:
  - Generate 1000+ random valid game states (random cards, random board configurations).
  - Run both solvers. Assert identical ranked moves (card, position, outcome).
  - Any discrepancy is a bug to investigate before proceeding.

**Tests:**
- Cross-verification script passes with 0 discrepancies.
- Property-based test passes 1000+ random states.

**Verification:** Engines are verified equivalent. Document any edge cases found.

**Commit and end session.**

---

## Step 9: Native server binary (optional mode)

**Goal:** Compile the same Rust crate as a standalone HTTP server for power users.

**What to implement:**
- `engine-rs/src/bin/server.rs`:
  - Axum HTTP server with `POST /api/solve` endpoint
  - Request: `{ state, unknownCardIds, cardPool, samplingWeights?, simCount? }`
  - Response: `{ moves: RankedMove[] }`
  - Internally: samples worlds, runs PIMC via Rayon thread pool, aggregates
- `store.ts`: add `triggerServerSolve()` path
  - Reads `solverMode` and `serverEndpoint` from config
  - Falls back to WASM if server unreachable
- Settings UI: text field for server endpoint (simple, in RulesetInput or a new
  Settings component — minimal UI, just the endpoint input)

**Tests:**
- Server integration test: start server, POST a solve request, verify response matches
  WASM output for the same input.
- `store.ts` test: mock fetch, verify server mode dispatches correctly.

**Verification:** Server binary works. Client can switch between WASM and server modes.

**Commit and end session.**

---

## Step 10: Cleanup + documentation

**Goal:** Remove TypeScript engine code, update docs, finalize.

**What to do:**
- Remove `src/engine/solver.ts` (replaced by Rust WASM)
- Remove `src/engine/solver.worker.ts` (replaced by WASM worker)
- Remove `src/engine/pimc.ts` (PIMC orchestration stays in TS store, but `runPIMC` and
  `findBestMove` imports are gone)
- Keep `src/engine/board.ts` — still used by UI for client-side rendering
- Keep `src/engine/types.ts` — still used by UI components
- Keep `src/engine/index.ts` — re-exports for UI
- Update engine tests: TypeScript solver tests removed (replaced by Rust tests +
  cross-verification). Board tests stay (client-side board.ts still exists).
- Update `README.md` with build instructions (Rust toolchain, wasm-pack)
- Update `CLAUDE.md` tech stack table
- Update memory entries

**Tests:**
- `bun run test` passes (UI tests + remaining TS engine tests)
- `cargo test` passes (Rust engine tests)
- Manual smoke test: All Open and Three Open both work in browser

**Verification:** Clean build, all tests pass, no dead TypeScript engine code.

**Commit and end session.**

---

## Risk Checkpoints

After **Step 5** (in-place mutation benchmark): if Rust speedup is <10× over TypeScript,
the WASM timing estimates are wrong. Stop and reassess — may need to optimize further
before proceeding to WASM integration, or adjust simulation count.

After **Step 7** (WASM PIMC benchmark): if turn 1 wall clock exceeds 20s with real cards,
the in-browser PIMC experience is degraded. Options: reduce simulation count, or prioritize
the server path (Step 9) over browser-only.

## Dependencies

```
Step 1 (types) ─────► Step 2 (board basic) ─────► Step 3 (capture rules)
                                                          │
                                                          ▼
                                                   Step 4 (solver)
                                                          │
                                                          ▼
                                                   Step 5 (mutation) ◄── BENCHMARK CHECKPOINT
                                                          │
                                                          ▼
                                                   Step 6 (WASM pipeline)
                                                          │
                                                          ▼
                                                   Step 7 (PIMC workers) ◄── BENCHMARK CHECKPOINT
                                                          │
                                              ┌───────────┴───────────┐
                                              ▼                       ▼
                                       Step 8 (cross-verify)   Step 9 (server)
                                              │                       │
                                              └───────────┬───────────┘
                                                          ▼
                                                   Step 10 (cleanup)
```
