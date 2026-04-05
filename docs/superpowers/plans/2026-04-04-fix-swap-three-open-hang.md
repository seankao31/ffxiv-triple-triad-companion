# Fix: Start Game Hangs When Both Swap and Three Open Are Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `handleSwap` so it correctly handles null opponent hand entries from Three Open, creating placeholders and tracking `unknownCardIds`.

**Architecture:** `handleSwap` (in `src/app/store.ts`) currently assumes all 5 opponent hand entries are non-null `Card` objects. When Three Open is active, some entries are `null`. The fix adds null-handling that mirrors the existing pattern in `startGame()`'s non-swap path: create placeholder cards via `createCard(1, 1, 1, 1)` for null slots, collect their IDs into `unknownCardIds`, and pass that set into the game state update.

**Tech Stack:** TypeScript, Svelte stores, vitest

---

## Root Cause

`handleSwap` (store.ts:311) casts `s.opponentHand as Card[]` and calls `c.id` on every entry. When Three Open leaves some slots `null`, this throws a `TypeError`. The error is unhandled in SwapStep's `confirm()` click handler — the browser swallows it, leaving the UI stuck in the swap phase.

## File Structure

No new files. Changes to:

| File | Change |
|------|--------|
| `src/app/store.ts` | Fix `handleSwap` to handle null opponent entries |
| `tests/app/store.test.ts` | Add Swap + Three Open tests |

---

### Task 1: Write failing test — handleSwap does not crash with null opponent slots

**Files:**
- Modify: `tests/app/store.test.ts` (inside the `'swap rule'` describe block, after line 536)

- [x] **Step 1: Write the failing test**

Add this test at the end of the `describe('swap rule', ...)` block (after the ID range test at line 536, before the closing `});`):

```typescript
it('handleSwap works when opponent hand has null slots (Three Open + Swap)', () => {
  updateSwap(true);
  updateThreeOpen(true);
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeThreeOpenOpponentCards(); // fills slots 0-2, leaves 3-4 null
  startGame(); // enters swap phase
  expect(get(game).phase).toBe('swap');

  const s = get(game);
  const given = s.playerHand[0]!;
  const received = s.opponentHand[0]!; // one of the 3 known cards
  expect(() => handleSwap(given, received)).not.toThrow();
  expect(get(game).phase).toBe('play');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/store.test.ts -t "handleSwap works when opponent hand has null slots"`
Expected: FAIL — TypeError on `c.id` when `c` is null inside `handleSwap`.

- [x] **Step 3: Commit failing test**

```
git add tests/app/store.test.ts
git commit -m 'test(store): add failing test for handleSwap with Three Open nulls'
```

---

### Task 2: Write failing test — unknownCardIds populated after swap with Three Open

**Files:**
- Modify: `tests/app/store.test.ts` (same describe block)

- [x] **Step 1: Write the failing test**

Add after the test from Task 1:

```typescript
it('handleSwap populates unknownCardIds for null opponent slots (Three Open + Swap)', () => {
  updateSwap(true);
  updateThreeOpen(true);
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeThreeOpenOpponentCards(); // fills slots 0-2, leaves 3-4 null
  startGame();

  const s = get(game);
  const given = s.playerHand[0]!;
  const received = s.opponentHand[0]!;
  handleSwap(given, received);

  const after = get(game);
  // 2 null slots → 2 unknown card IDs
  expect(after.unknownCardIds.size).toBe(2);
  // All 5 opponent hand entries should be non-null Card objects
  expect(after.opponentHand.every((c) => c !== null)).toBe(true);
  // The placeholder IDs should match specific opponent hand entries
  for (const id of after.unknownCardIds) {
    expect(after.opponentHand.some((c) => c!.id === id)).toBe(true);
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/store.test.ts -t "handleSwap populates unknownCardIds"`
Expected: FAIL — same TypeError crash (or if Task 1 fix is already in, `unknownCardIds` will be empty).

- [x] **Step 3: Commit failing test**

```
git add tests/app/store.test.ts
git commit -m 'test(store): add failing test for unknownCardIds after swap with Three Open'
```

---

### Task 3: Write failing test — card IDs remain 0–9 with swap + Three Open

**Files:**
- Modify: `tests/app/store.test.ts` (same describe block)

- [x] **Step 1: Write the failing test**

Add after the test from Task 2:

```typescript
it('handleSwap produces cards with IDs 0–9 when Three Open has null slots', () => {
  updateSwap(true);
  updateThreeOpen(true);
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeThreeOpenOpponentCards(); // fills slots 0-2, leaves 3-4 null
  startGame();

  // Simulate ID counter pollution
  createCard(1, 1, 1, 1);
  createCard(1, 1, 1, 1);

  const s = get(game);
  const given = s.playerHand[2]!;
  const received = s.opponentHand[1]!;
  handleSwap(given, received);

  const after = get(game);
  const allCards = [
    ...after.playerHand.filter((c): c is Card => c !== null),
    ...after.opponentHand.filter((c): c is Card => c !== null),
  ];
  const ids = allCards.map((c) => c.id).sort((a, b) => a - b);
  expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/store.test.ts -t "handleSwap produces cards with IDs 0–9 when Three Open"`
Expected: FAIL — same TypeError crash.

- [x] **Step 3: Commit failing test**

```
git add tests/app/store.test.ts
git commit -m 'test(store): add failing test for ID range with swap + Three Open'
```

---

### Task 4: Implement the fix in handleSwap

**Files:**
- Modify: `src/app/store.ts:301-327` (the `handleSwap` function)

- [x] **Step 1: Apply the fix**

Replace the current `handleSwap` function (lines 301–327) with:

```typescript
export function handleSwap(given: Card, received: Card): void {
  const s = get(game);
  // Reset card IDs and re-create all cards to guarantee deterministic IDs.
  resetCardIds();
  const freshPlayerHand = s.playerHand.map((c) => {
    if (!c) return null;
    // Replace the given card with the received card (match by original ID before reset).
    const base = c.id === given.id ? received : c;
    return createCard(base.top, base.right, base.bottom, base.left, base.type);
  });
  // Re-create known opponent cards; assign placeholder IDs for Three Open unknowns.
  const unknownCardIds = new Set<number>();
  const freshOpponentHand = s.opponentHand.map((c) => {
    if (c === null) {
      const placeholder = createCard(1, 1, 1, 1);
      unknownCardIds.add(placeholder.id);
      return placeholder;
    }
    const base = c.id === received.id ? given : c;
    return createCard(base.top, base.right, base.bottom, base.left, base.type);
  });
  // Send newGame before updating state so the Worker resets its TT before
  // the solve request (triggered by the currentState subscription) arrives.
  solverWorker.postMessage({ type: 'newGame' });
  game.update((g) => {
    const initial = createInitialState(
      freshPlayerHand as Card[],
      freshOpponentHand,
      g.firstTurn,
      g.ruleset,
    );
    return { ...g, playerHand: freshPlayerHand, opponentHand: freshOpponentHand, phase: 'play', history: [initial], unknownCardIds };
  });
}
```

Key changes from the original:
1. `s.opponentHand` is no longer cast to `Card[]` — each entry is checked for `null`
2. Null entries become placeholder cards via `createCard(1, 1, 1, 1)` (same pattern as `startGame`)
3. Placeholder IDs are collected into `unknownCardIds`
4. `unknownCardIds` is passed into the `game.update` state

- [x] **Step 2: Run all three new tests to verify they pass**

Run: `bunx vitest run tests/app/store.test.ts -t "Three Open + Swap|unknownCardIds for null|IDs 0–9 when Three Open"`
Expected: all 3 PASS.

- [x] **Step 3: Run the full test suite to check for regressions**

Run: `bun run test`
Expected: all tests pass, no regressions.

- [x] **Step 4: Commit the fix**

```
git add src/app/store.ts
git commit -m 'fix(store): handle Three Open nulls in handleSwap'
```

---

### Task 5: Run type check and E2E tests

- [x] **Step 1: Run type check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [x] **Step 2: Run E2E tests**

Run: `bun run test:e2e`
Expected: all E2E tests pass (including the existing swap E2E test).

- [x] **Step 3: Final commit if any adjustments were needed**

Only if fixes were required. Otherwise, the work is done.
