# Visual Regression Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright visual regression tests to catch CSS/layout regressions that happy-dom unit tests cannot detect.

**Architecture:** A single dedicated test file (`tests/e2e/visual.test.ts`) captures element-scoped screenshots at 4 key visual states. Two `data-testid` attributes are added for reliable element locators. The test reuses existing E2E helpers.

**Tech Stack:** Playwright `toHaveScreenshot()` (v1.59.1), existing Vite dev server on :4173

**Spec:** `docs/superpowers/specs/2026-04-07-visual-regression-tests-design.md`

**Prerequisite:** WASM must be pre-built (`cd engine-rs && wasm-pack build --target web`), same as existing E2E tests.

---

### Task 1: Add data-testid attributes

**Files:**
- Modify: `src/app/components/game/Board.svelte:30`
- Modify: `src/app/components/game/GameView.svelte:42`

- [ ] **Step 1: Add testid to Board grid**

In `src/app/components/game/Board.svelte`, line 30, change:

```svelte
<div class="grid grid-cols-3 gap-2">
```

to:

```svelte
<div data-testid="board" class="grid grid-cols-3 gap-2">
```

- [ ] **Step 2: Add testid to game layout container**

In `src/app/components/game/GameView.svelte`, line 42, change:

```svelte
  <div class="flex gap-10 flex-1 items-start justify-center pt-6">
```

to:

```svelte
  <div data-testid="game-layout" class="flex gap-10 flex-1 items-start justify-center pt-6">
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `bunx vitest run tests/app/`
Expected: 203 tests pass (testid attributes don't affect behavior)

- [ ] **Step 4: Commit**

```
git add src/app/components/game/Board.svelte src/app/components/game/GameView.svelte
git commit -m 'feat: add data-testid attributes to Board and GameView for visual testing'
```

---

### Task 2: Write visual regression test — setup view

**Files:**
- Create: `tests/e2e/visual.test.ts`

- [ ] **Step 1: Create test file with setup view snapshot**

Create `tests/e2e/visual.test.ts`:

```ts
// ABOUTME: Visual regression tests — screenshot diffing to catch CSS/layout regressions.
// ABOUTME: Captures element-scoped snapshots at key visual states; decoupled from functional E2E tests.
import { test, expect } from '@playwright/test';
import { fillHands, placeCard, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.01 };

test('setup view with filled hands', async ({ page }) => {
  await page.goto('/');
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);

  await expect(page).toHaveScreenshot('setup-filled-hands.png', SCREENSHOT_OPTS);
});
```

- [ ] **Step 2: Run with --update-snapshots to generate baseline**

Run: `bunx playwright test visual --update-snapshots`
Expected: 1 test passes, baseline PNG created in `tests/e2e/visual.test.ts-snapshots/`

- [ ] **Step 3: Run without flag to verify baseline comparison works**

Run: `bunx playwright test visual`
Expected: 1 test passes (matches its own baseline)

- [ ] **Step 4: Commit**

```
git add tests/e2e/visual.test.ts tests/e2e/visual.test.ts-snapshots/
git commit -m 'test: add visual regression test for setup view'
```

---

### Task 3: Add hand panels snapshot

**Files:**
- Modify: `tests/e2e/visual.test.ts`

- [ ] **Step 1: Add hand panels test**

Append to `tests/e2e/visual.test.ts`, after the setup test:

```ts
test('hand panels at game start', async ({ page }) => {
  await page.goto('/');
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  const layout = page.getByTestId('game-layout');
  await expect(layout).toHaveScreenshot('hand-panels-game-start.png', SCREENSHOT_OPTS);
});
```

- [ ] **Step 2: Generate baseline**

Run: `bunx playwright test visual --update-snapshots`
Expected: 2 tests pass, new baseline PNG created

- [ ] **Step 3: Verify baseline comparison**

Run: `bunx playwright test visual`
Expected: 2 tests pass

- [ ] **Step 4: Commit**

```
git add tests/e2e/visual.test.ts tests/e2e/visual.test.ts-snapshots/
git commit -m 'test: add visual regression test for hand panels at game start'
```

---

### Task 4: Add board mid-game snapshot

**Files:**
- Modify: `tests/e2e/visual.test.ts`

- [ ] **Step 1: Add board mid-game test**

Append to `tests/e2e/visual.test.ts`:

```ts
test('board mid-game with placed cards', async ({ page }) => {
  await page.goto('/');
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Place 6 cards (3 player, 3 opponent) — always click first empty cell.
  await placeCard(page, '5 3 7 2', 0);  // Player turn 1
  await placeCard(page, '4 5 6 3', 0);  // Opponent turn 2
  await placeCard(page, '4 6 2 8', 0);  // Player turn 3
  await placeCard(page, '7 3 5 4', 0);  // Opponent turn 4
  await placeCard(page, '3 5 5 7', 0);  // Player turn 5
  await placeCard(page, '2 8 1 6', 0);  // Opponent turn 6

  const layout = page.getByTestId('game-layout');
  await expect(layout).toHaveScreenshot('board-mid-game.png', SCREENSHOT_OPTS);
});
```

- [ ] **Step 2: Generate baseline**

Run: `bunx playwright test visual --update-snapshots`
Expected: 3 tests pass, new baseline PNG created

- [ ] **Step 3: Verify baseline comparison**

Run: `bunx playwright test visual`
Expected: 3 tests pass

- [ ] **Step 4: Commit**

```
git add tests/e2e/visual.test.ts tests/e2e/visual.test.ts-snapshots/
git commit -m 'test: add visual regression test for board mid-game'
```

---

### Task 5: Add solver suggestion snapshot

**Files:**
- Modify: `tests/e2e/visual.test.ts`

- [ ] **Step 1: Add solver suggestion test**

Append to `tests/e2e/visual.test.ts`:

```ts
test('solver suggestion with best move highlight', async ({ page }) => {
  await page.goto('/');
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Place 6 cards to reduce search space (solver evaluates ~6 moves).
  await placeCard(page, '5 3 7 2', 0);  // Player turn 1
  await placeCard(page, '4 5 6 3', 0);  // Opponent turn 2
  await placeCard(page, '4 6 2 8', 0);  // Player turn 3
  await placeCard(page, '7 3 5 4', 0);  // Opponent turn 4
  await placeCard(page, '3 5 5 7', 0);  // Player turn 5
  await placeCard(page, '2 8 1 6', 0);  // Opponent turn 6

  // Wait for solver to return — gold ring appears on best-move card.
  const layout = page.getByTestId('game-layout');
  await layout.locator('.ring-accent-gold').waitFor({ timeout: 10_000 });

  // Select the best-move card to trigger eval overlays on empty board cells.
  await layout.locator('.ring-accent-gold').click();
  await layout.locator('[data-eval]').first().waitFor();

  await expect(layout).toHaveScreenshot('solver-suggestion.png', SCREENSHOT_OPTS);
});
```

- [ ] **Step 2: Generate baseline**

Run: `bunx playwright test visual --update-snapshots`
Expected: 4 tests pass, new baseline PNG created

- [ ] **Step 3: Verify baseline comparison**

Run: `bunx playwright test visual`
Expected: 4 tests pass

- [ ] **Step 4: Commit**

```
git add tests/e2e/visual.test.ts tests/e2e/visual.test.ts-snapshots/
git commit -m 'test: add visual regression test for solver suggestion highlight'
```

---

### Task 6: Verify full E2E suite and final commit

- [ ] **Step 1: Run all E2E tests together**

Run: `bunx playwright test`
Expected: All tests pass (existing 8 functional + 4 new visual)

- [ ] **Step 2: Run unit tests to confirm no regressions**

Run: `bunx vitest run tests/app/`
Expected: 203 tests pass

- [ ] **Step 3: Verify snapshot directory is committed**

Run: `git status`
Expected: Clean working tree — all baselines committed in previous tasks
