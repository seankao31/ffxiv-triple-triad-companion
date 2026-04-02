# Mutation Testing Results

Systematic mutation testing of the TypeScript test suite to verify coverage
of real bugs. 42 mutations were designed across 5 source files, each introducing
a single deliberate minimal bug. Tests were run against each mutation to confirm
detection ("kill") or reveal a gap ("survive").

---

## Protocol

For each mutation:
1. Apply a single code change to production code
2. Run the relevant test suite (`bun test tests/engine` or `bunx vitest run`)
3. If **killed** (tests fail): record which test caught it, revert
4. If **survived** (tests pass): write a test to catch it, verify it kills the mutation, revert the production code change

---

## Results Summary

| Metric | Count |
|--------|-------|
| Total mutations | 42 |
| Killed | 36 |
| Survived (test gap fixed) | 3 predicted + 3 surprise = 6 |
| Equivalent (no fix needed) | 3 |
| Imprecise assertion tightened | 1 |
| **Final kill rate** | **39/39 non-equivalent = 100%** |

---

## Test Gaps Found and Fixed

### M6 — Ascension cap: `Math.min(10, ...)` → `Math.min(9, ...)`

**File:** `src/engine/board.ts:13`
**Why it survived:** The existing "caps at 10" test was symmetric — both attacker
(Primal, 3 on board, top=9→capped) and defender (Society, 1 on board, bottom=9+1=10)
hit the cap. Lowering cap to 9 affected both sides equally: 9>9 = no capture, same
as the expected 10>10 = no capture.

**Fix:** Asymmetric test. Attacker Primal top=8 with 3 same-type on board
(min(10, 8+3)=10). Defender Society bottom=8 with only itself on board (8+1=9).
With cap=10: 10>9 → capture. With cap=9: 9>9 → no capture.

### M7 — Descension floor: `Math.max(1, ...)` → `Math.max(0, ...)`

**File:** `src/engine/board.ts:14`
**Why it survived:** No existing test pushed a defender's effective value below 1.
All test scenarios had values high enough that the floor never mattered.

**Fix:** Defender Scion bottom=2 with 3 Scions on board (max(1, 2-3)=1). Attacker
Garlean top=1 with 0 Garleans on board (1-0=1). Correct: 1>1 = no capture.
Mutated: max(0, -1)=0, and 1>0 = capture.

### M25/M26 — `cardWeight()` wrong stats or constant weight

**File:** `src/engine/pimc.ts:19-21`
**Why they survived:** No test verified the weight distribution of weighted sampling.
Tests only checked count, uniqueness, and edge cases — not that high-stat cards
were actually favored.

**Fix:** Statistical test with 5000 trials. One strong card (10,10,1,1, weight=20)
vs four weak cards (1,1,1,1, weight=2). Assert strong card appears in >63% of
single-card samples. Non-uniform stats ensure M25 (wrong index: stats[0]+stats[2]
= 10+1=11 instead of 10+10=20) is distinguishable from correct behavior.

### M42 — PIMC confidence: `count / pimcTotal` → `count / pimcPending`

**File:** `src/app/store.ts:123`
**Why it survived:** `pimcPending` is 0 when all simulations complete, so the mutated
code produces `Infinity`. The test only checked `confidence > 0`, and `Infinity > 0`
is true.

**Fix:** Added `expect(confidence).toBeLessThanOrEqual(1)` — confidence must be a
valid fraction.

### M2 — Reverse capture: `<` → `<=` (surprise survivor)

**File:** `src/engine/board.ts:27`
**Why it survived:** Both existing Reverse tests used strictly unequal values (7 vs 5,
3 vs 7). No test checked that equal values don't capture under Reverse. The `<=`
mutation only differs from `<` when attacker equals defender.

**Fix:** Added test: attacker top=5 vs defender bottom=5 under Reverse. Correct:
5<5 = false → no capture. Mutated: 5<=5 = true → capture.

### M23 — `createCard()`: remove `_nextCardId++` (surprise survivor)

**File:** `src/engine/types.ts:93`
**Why it survived:** Engine tests use card object identity and stats for assertions,
not card IDs. The WASM solver tests (which depend on unique IDs for hash encoding)
couldn't run in the worktree. No basic engine test verified ID uniqueness.

**Fix:** Added test asserting three consecutive `createCard` calls produce distinct IDs.

### M37 — `cardModifier()`: remove `!typeAbbrev[cardType]` guard (surprise survivor)

**File:** `src/app/card-display.ts:30`
**Why it survived:** The existing "returns null for CardType.None" test used
`emptyState()` (no cards on board). Without the guard, the function still returns
null because `boardTypeCount` returns 0 and the `count === 0` guard catches it.
The `typeAbbrev` guard is only distinguishable when None-type cards are on the board.

**Fix:** Updated test to place a None-type card on the board before calling
`cardModifier(CardType.None, ...)`. Now the `typeAbbrev` guard is the only thing
preventing a non-null return.

---

## Imprecise Assertion Tightened

### M14 — Boundary: `position > 8` → `position > 9`

**File:** `src/engine/board.ts:147`
**Issue:** The mutation was killed, but by the wrong error — `ADJACENCY[9]` is
undefined, causing a TypeError rather than the intended "Invalid position: 9" Error.
The test only checked `.toThrow()` without validating the message.

**Fix:** Changed to `.toThrow("Invalid position: 9")` and `.toThrow("Invalid position: -1")`.

---

## Equivalent Mutations (No Fix Needed)

| ID | File | Mutation | Why Equivalent |
|----|------|----------|----------------|
| M19 | board.ts:124 | Remove `processed.has(pos)` BFS guard | Re-processing an already-flipped card re-checks already-flipped neighbors; `owner !== currentTurn` prevents additional flips. Defensive guard only. |
| M31 | pimc.ts:76 | `=== 5` → `>= 5` | No 6-star cards exist in the domain. |
| M33 | pimc.ts:61 | `>` → `>=` in `lookupStars` | No duplicate stat entries in card data. |

---

## Confirmation Sweep

All remaining mutations (M1, M3–M5, M8–M13, M15–M18, M20–M22, M24, M27–M30,
M32, M34–M36, M38–M41) were confirmed killed by existing tests.

---

## Coverage After Improvements

| Suite | Lines | Functions | Statements | Branches |
|-------|-------|-----------|------------|----------|
| Engine (`bun test`) | 99.73% | 96.88% | — | — |
| App (`bunx vitest run`) | 84.91% | 85.06% | 85.32% | 72.8% |

Engine uncovered: `createPlaceholderCard` in types.ts (only used by app layer).
App low coverage in engine files is expected — vitest exercises them indirectly
through store interactions; `bun test` is the authoritative engine coverage.

---

## Lessons Learned

1. **Symmetric tests hide mutations.** When both sides of a comparison are affected
   equally by a mutation, the test result doesn't change. Design tests so only one
   side hits the boundary.

2. **Statistical tests for probabilistic code.** Non-deterministic functions like
   weighted sampling need statistical assertions with enough trials to distinguish
   correct behavior from mutations, and non-uniform inputs to avoid equivalent mutations.

3. **`.toThrow()` without a message is imprecise.** The test catches *any* error,
   including unrelated TypeErrors from downstream code. Always validate the error
   message when the production code throws a specific one.

4. **Empty-state tests miss guard interactions.** When multiple guards exist in
   sequence, a test that triggers an early guard (like `count === 0`) won't detect
   removal of an earlier guard (like `!typeAbbrev[cardType]`).

---

## Cross-Engine Gap Closure (2026-04-02)

The mutation testing targeted the TypeScript engine only. A follow-up analysis
found that 5 of the 6 board/pimc gaps (M2, M6, M7, M14, M25/M26) had identical
vulnerabilities in the Rust engine's tests.

**Fixtures added** (shared JSON, tested by both TS and Rust):
- `reverse_equal_does_not_capture` (M2)
- `ascension_cap_asymmetric_capture` (M6)
- `descension_floor_at_one` (M7)

**Rust-specific tests added:**
- `#[should_panic(expected = "Invalid position: 9")]` (M14)
- `weighted_sample_favors_high_stat_cards` — 5000-trial statistical test (M25/M26)

**`place_card_mut`/`undo_place` coverage** — identified as a Rust-only code path
with 1 test (3 scenarios) vs. 38 tests for the immutable `place_card`. Fixed:
- All 29 board fixtures now run through `place_card_mut` + `undo_place`
- 5 targeted undo mechanics tests: card reinsertion index, turn restoration,
  board cell clearing, no-capture path, combo cascade owner restoration
