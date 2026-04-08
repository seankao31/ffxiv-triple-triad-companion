# All Open Rule & Visibility Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "All Open" visibility rule and change the default to "all hidden" with three mutually exclusive visibility modes.

**Architecture:** Add `allOpen` boolean to `AppState` alongside existing `threeOpen`. Mutual exclusion enforced by store update functions. CardInput gains a `disabled` prop for the hidden-mode locked "?" display. Validation in `startGame()` enforces per-mode constraints.

**Tech Stack:** Svelte 5, TypeScript, Vitest, @testing-library/svelte, Playwright

**Spec:** `docs/superpowers/specs/2026-04-08-all-open-rule-design.md`

---

### Task 1: Store — `allOpen` state and `updateAllOpen`

**Files:**
- Modify: `src/app/store.ts:18-52` (AppState type + initialAppState + updateThreeOpen)
- Test: `tests/app/store.test.ts`

- [ ] **Step 1: Write failing tests for `allOpen` state and mutual exclusion**

Add to `tests/app/store.test.ts`. Import `updateAllOpen` alongside existing imports (it will fail to resolve until implemented).

```typescript
// In the imports at top, add updateAllOpen:
// import { ..., updateAllOpen, ... } from '../../src/app/store';

// Add inside the 'setup' describe block:
it('defaults allOpen to false', () => {
  expect(get(game).allOpen).toBe(false);
});

it('updateAllOpen sets allOpen', () => {
  updateAllOpen(true);
  expect(get(game).allOpen).toBe(true);
});

it('updateAllOpen(true) clears threeOpen', () => {
  updateThreeOpen(true);
  expect(get(game).threeOpen).toBe(true);
  updateAllOpen(true);
  expect(get(game).allOpen).toBe(true);
  expect(get(game).threeOpen).toBe(false);
});

it('updateThreeOpen(true) clears allOpen', () => {
  updateAllOpen(true);
  expect(get(game).allOpen).toBe(true);
  updateThreeOpen(true);
  expect(get(game).threeOpen).toBe(true);
  expect(get(game).allOpen).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: FAIL — `updateAllOpen` is not exported, `allOpen` not in AppState.

- [ ] **Step 3: Implement `allOpen` state and mutual exclusion**

In `src/app/store.ts`:

1. Add `allOpen` to the `AppState` type (after the `threeOpen` field):
```typescript
  // All Open reveals all 5 opponent hand cards at game start.
  // Mutually exclusive with threeOpen; neither checked = all opponent cards hidden.
  allOpen: boolean;
```

2. Add `allOpen: false` to `initialAppState` (after `threeOpen: false`).

3. Add the `updateAllOpen` function (next to `updateThreeOpen`):
```typescript
export function updateAllOpen(allOpen: boolean): void {
  game.update((s) => ({ ...s, allOpen, threeOpen: allOpen ? false : s.threeOpen }));
}
```

4. Update `updateThreeOpen` to clear `allOpen`:
```typescript
export function updateThreeOpen(threeOpen: boolean): void {
  game.update((s) => ({ ...s, threeOpen, allOpen: threeOpen ? false : s.allOpen }));
}
```

5. Export `updateAllOpen` so tests and components can import it.

- [ ] **Step 4: Update `beforeEach` in test files to include `allOpen`**

In `tests/app/store.test.ts`, add `allOpen: false` to the `game.set()` call in `beforeEach` (after `threeOpen: false`).

In `tests/app/components/SetupView.test.ts`, add `allOpen: false` to the `game.set()` call in `beforeEach` (after `threeOpen: false`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: PASS — all new and existing tests pass.

- [ ] **Step 6: Commit**

```
git add src/app/store.ts tests/app/store.test.ts tests/app/components/SetupView.test.ts
git commit -m 'feat: add allOpen state with mutual exclusion to store'
```

---

### Task 2: Store — Revised `startGame()` validation

**Files:**
- Modify: `src/app/store.ts:350-357` (startGame validation)
- Test: `tests/app/store.test.ts`

- [ ] **Step 1: Write failing tests for the three validation modes**

Add to `tests/app/store.test.ts` inside the `startGame` describe block:

```typescript
it('throws when All Open and opponent hand has null slots', () => {
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeOpponentHand().slice(0, 3).forEach((c, i) => updateOpponentCard(i, c));
  updateAllOpen(true);

  expect(() => startGame()).toThrow('All opponent hand slots must be filled');
});

it('starts game when All Open and all opponent slots are filled', () => {
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
  updateAllOpen(true);

  startGame();
  expect(get(game).phase).toBe('play');
});

it('throws when Three Open and opponent hand does not have exactly 2 unknowns', () => {
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  // Only 1 null — should fail (needs exactly 2)
  makeOpponentHand().slice(0, 4).forEach((c, i) => updateOpponentCard(i, c));
  updateThreeOpen(true);

  expect(() => startGame()).toThrow('Three Open requires exactly 2 unknown cards');
});

it('throws when Three Open and opponent hand has 0 unknowns', () => {
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
  updateThreeOpen(true);

  expect(() => startGame()).toThrow('Three Open requires exactly 2 unknown cards');
});

it('starts game when Three Open and opponent hand has exactly 2 unknowns', () => {
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeThreeOpenOpponentCards(); // fills slots 0-2, leaves 3-4 null
  updateThreeOpen(true);

  startGame();
  expect(get(game).phase).toBe('play');
});

it('starts game in hidden mode with all 5 opponent slots null', () => {
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  // Neither allOpen nor threeOpen — all 5 opponent slots null (default)

  startGame();
  expect(get(game).phase).toBe('play');
  expect(get(game).unknownCardIds.size).toBe(5);
});

it('throws in hidden mode when opponent hand has some but not all slots filled', () => {
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  updateOpponentCard(0, createCard(5, 5, 5, 5));
  // Neither allOpen nor threeOpen, but 1 slot filled — invalid

  expect(() => startGame()).toThrow('opponent hand slots must be empty');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: FAIL — current validation doesn't match new rules.

- [ ] **Step 3: Implement revised validation in `startGame()`**

Replace the existing opponent hand validation block in `src/app/store.ts` (lines 355-357) with:

```typescript
  const nullCount = s.opponentHand.filter((c) => c === null).length;
  if (s.allOpen && nullCount > 0) {
    throw new Error('All opponent hand slots must be filled when All Open is active.');
  }
  if (s.threeOpen && nullCount !== 2) {
    throw new Error('Three Open requires exactly 2 unknown cards.');
  }
  if (!s.allOpen && !s.threeOpen && nullCount !== 5) {
    throw new Error('All opponent hand slots must be empty when no visibility rule is active.');
  }
```

- [ ] **Step 4: Update existing tests that rely on old validation**

Many existing tests fill all 10 card slots and call `startGame()` without setting a visibility mode. With the new default being "hidden", these now violate the "all 5 null" constraint.

**Add `updateAllOpen(true)` before `startGame()`** in each of these tests in `tests/app/store.test.ts`:

- `'transitions to play phase and creates initial game state'`
- `'respects firstTurn when creating initial state'`
- `'throws if both Ascension and Descension are active'`
- `'throws if player hand contains duplicate cards'`
- `'throws if opponent hand contains duplicate cards'`
- `'allows same card stats across player and opponent hands'`

Search for ALL `startGame()` calls in `store.test.ts` and check each one — any test that fills all 10 slots without enabling a visibility mode needs `updateAllOpen(true)`.

The test `'throws if any hand slot is null'` fills 4 player slots + all 5 opponent slots. It tests player-hand validation (which fires first), so it will still throw before hitting opponent-hand validation. But with the new rules, filling 5 opponent slots with no visibility rule is invalid too — add `updateAllOpen(true)` for correctness.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat: revise startGame validation for three visibility modes'
```

---

### Task 3: Store — Update `SetupView.test.ts` for new validation

**Files:**
- Test: `tests/app/components/SetupView.test.ts`

- [ ] **Step 1: Update SetupView tests that call startGame with full hands**

Three tests fill both hands and call Start Game via UI click. They need `allOpen: true` set in the store.

Fix `'transitions to play phase when all cards are filled and Start Game is clicked'`:
```typescript
game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh, allOpen: true }));
```

Fix `'transitions to play phase when Enter is pressed with complete hands'`:
```typescript
game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh, allOpen: true }));
```

Fix `'transitions to swap phase when Swap checkbox is checked and Start Game is clicked'`:
```typescript
game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh, allOpen: true }));
```

The test `'displays preserved player hand values after reset'` sets only `playerHand` with empty opponent — this is hidden mode, which is the new default. It doesn't call `startGame()`, so no change needed. However, note that after this task the test expects `topInputs[5]` to have value `''` — but in hidden mode, opponent card slots won't have stat inputs at all (they'll be disabled "?"). This test will break after Task 5 wires the disabled prop. **We'll fix it in Task 5.**

- [ ] **Step 2: Run SetupView tests**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: PASS

- [ ] **Step 3: Run full unit test suite to check for other breakage**

Run: `bunx vitest run`
Expected: PASS — no other tests broken.

- [ ] **Step 4: Commit**

```
git add tests/app/components/SetupView.test.ts
git commit -m 'test: update SetupView tests for allOpen visibility mode'
```

---

### Task 4: CardInput — `disabled` prop for locked "?" display

**Files:**
- Modify: `src/app/components/setup/CardInput.svelte`
- Test: `tests/app/components/CardInput.test.ts`

- [ ] **Step 1: Write failing tests for `disabled` prop**

Add to `tests/app/components/CardInput.test.ts`:

```typescript
it('renders locked unknown display when disabled is true', () => {
  render(CardInput, { props: { onchange: vi.fn(), disabled: true } });
  expect(screen.getByText('?')).toBeInTheDocument();
  expect(screen.queryByLabelText('Top')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Toggle unknown')).not.toBeInTheDocument();
});

it('does not call onchange when disabled', () => {
  const onchange = vi.fn();
  render(CardInput, { props: { onchange, disabled: true } });
  expect(onchange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/CardInput.test.ts`
Expected: FAIL — `disabled` prop not supported, stat inputs still render.

- [ ] **Step 3: Implement `disabled` prop**

In `src/app/components/setup/CardInput.svelte`:

1. Add `disabled = false` to the props destructuring:
```typescript
  let {
    onchange,
    onadvance = () => {},
    onback = () => {},
    allowUnknown = false,
    disabled = false,
    card = null,
  }: {
    onchange: (card: Card | null) => void;
    onadvance?: () => void;
    onback?: () => void;
    allowUnknown?: boolean;
    disabled?: boolean;
    card?: Card | null;
  } = $props();
```

2. In the template, add `disabled` as the first branch before `isUnknown`. The disabled state renders identically to unknown (large "?" placeholder) but without the toggle:

```svelte
  {#if disabled}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-3xl font-bold text-surface-400">?</span>
    </div>
  {:else if isUnknown}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-3xl font-bold text-surface-400">?</span>
    </div>
  {:else}
    <!-- existing stat inputs grid (unchanged) -->
```

3. Update the outer div's class expression to include `disabled`:
```
{isUnknown || disabled ? 'opacity-60 border-dashed' : ''}
```

4. Guard the type dropdown: change `{#if !isUnknown}` to `{#if !isUnknown && !disabled}`.

5. Guard the unknown toggle: change `{#if allowUnknown}` to `{#if allowUnknown && !disabled}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/CardInput.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/app/components/setup/CardInput.svelte tests/app/components/CardInput.test.ts
git commit -m 'feat: add disabled prop to CardInput for locked unknown display'
```

---

### Task 5: HandInput + SetupView — wire `disabled` prop for hidden mode

**Files:**
- Modify: `src/app/components/setup/HandInput.svelte`
- Modify: `src/app/components/setup/SetupView.svelte`
- Test: `tests/app/components/SetupView.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/app/components/SetupView.test.ts`:

```typescript
it('renders All Open checkbox', () => {
  render(SetupView);
  expect(screen.getByLabelText(/all open/i)).toBeInTheDocument();
});

it('renders opponent hand as locked unknowns when neither visibility rule is active', () => {
  render(SetupView);
  // Default: neither allOpen nor threeOpen — opponent inputs should be disabled
  // All 5 opponent card slots should show "?" and no stat inputs
  const questionMarks = screen.getAllByText('?');
  expect(questionMarks.length).toBe(5);
  // Opponent hand should have no stat inputs — only player hand's 5 "Top" inputs exist
  expect(screen.getAllByLabelText('Top').length).toBe(5);
});

it('enables opponent hand inputs when All Open is checked', async () => {
  render(SetupView);
  await fireEvent.click(screen.getByLabelText(/all open/i));
  // Now opponent hand should have editable stat inputs
  expect(screen.getAllByLabelText('Top').length).toBe(10); // 5 player + 5 opponent
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: FAIL — All Open checkbox doesn't exist, opponent hand still editable.

- [ ] **Step 3: Add `disabled` prop to HandInput**

In `src/app/components/setup/HandInput.svelte`, add `disabled = false` to props:

```typescript
  let {
    label,
    hand = [null, null, null, null, null],
    onchange,
    onadvance = () => {},
    onback = () => {},
    allowUnknown = false,
    disabled = false,
  }: {
    label: string;
    hand?: (Card | null)[];
    onchange: (index: number, card: Card | null) => void;
    onadvance?: () => void;
    onback?: () => void;
    allowUnknown?: boolean;
    disabled?: boolean;
  } = $props();
```

Pass `disabled` through to each `CardInput`:

```svelte
      <CardInput
        card={hand[i] ?? null}
        onchange={(card) => onchange(i, card)}
        onadvance={i < 4 ? () => cardRefs[i + 1]?.focusFirst() : onadvance}
        onback={i > 0 ? () => cardRefs[i - 1]?.focusLast() : onback}
        {allowUnknown}
        {disabled}
        bind:this={cardRefs[i]}
      />
```

- [ ] **Step 4: Wire disabled and allOpen in SetupView**

In `src/app/components/setup/SetupView.svelte`:

1. Add `updateAllOpen` to the import from `../../store`:
```typescript
import { game, startGame, updatePlayerCard, updateOpponentCard, updateFirstTurn, updateThreeOpen, updateAllOpen } from '../../store';
```

2. Update the opponent `HandInput` to compute the disabled state:

```svelte
      <HandInput
        label="Opponent Hand"
        onchange={updateOpponentCard}
        onback={() => playerHandRef?.focusLast()}
        allowUnknown={$game.threeOpen}
        disabled={!$game.allOpen && !$game.threeOpen}
        bind:this={opponentHandRef}
      />
```

- [ ] **Step 5: Fix the `'displays preserved player hand values after reset'` test**

This test checks `topInputs[5]` expecting empty opponent hand inputs. But in hidden mode (default), opponent card slots are disabled "?" — no stat inputs exist. The test needs to verify that opponent hand is disabled instead.

Replace the opponent hand assertion:
```typescript
  // Opponent hand should be disabled (locked "?") — no stat inputs
  const questionMarks = screen.getAllByText('?');
  expect(questionMarks.length).toBe(5);
```

Remove the lines checking `topInputs[5]` and `topInputs[6]`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```
git add src/app/components/setup/HandInput.svelte src/app/components/setup/SetupView.svelte tests/app/components/SetupView.test.ts
git commit -m 'feat: wire disabled opponent hand for hidden visibility mode'
```

---

### Task 6: RulesetInput — All Open checkbox with mutual exclusion

**Files:**
- Modify: `src/app/components/setup/RulesetInput.svelte`
- Test: `tests/app/components/SetupView.test.ts`

- [ ] **Step 1: Write failing test for mutual exclusion in UI**

Add to `tests/app/components/SetupView.test.ts`:

```typescript
it('checking All Open unchecks Three Open', async () => {
  render(SetupView);
  const allOpen = screen.getByLabelText(/all open/i);
  const threeOpen = screen.getByLabelText(/three open/i);

  await fireEvent.click(threeOpen);
  expect(get(game).threeOpen).toBe(true);

  await fireEvent.click(allOpen);
  expect(get(game).allOpen).toBe(true);
  expect(get(game).threeOpen).toBe(false);
});

it('checking Three Open unchecks All Open', async () => {
  render(SetupView);
  const allOpen = screen.getByLabelText(/all open/i);
  const threeOpen = screen.getByLabelText(/three open/i);

  await fireEvent.click(allOpen);
  expect(get(game).allOpen).toBe(true);

  await fireEvent.click(threeOpen);
  expect(get(game).threeOpen).toBe(true);
  expect(get(game).allOpen).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: FAIL — All Open checkbox doesn't exist in RulesetInput yet.

- [ ] **Step 3: Add All Open checkbox to RulesetInput**

In `src/app/components/setup/RulesetInput.svelte`:

1. Update imports to include `updateAllOpen`:
```typescript
import { game, updateRuleset, updateSwap, updateThreeOpen, updateAllOpen } from '../../store';
```

2. Add state for `allOpen`:
```typescript
let allOpen = $state($game.allOpen);
```

3. Add the "All Open" checkbox label after the "Three Open" label (at the end of the flex container):
```svelte
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => allOpen,
      (v) => { allOpen = v; updateAllOpen(allOpen); if (allOpen) threeOpen = false; }
    } class="accent-accent-blue" />
    All Open
  </label>
```

4. Update the Three Open checkbox setter to sync local `allOpen` state:
```svelte
    <input type="checkbox" bind:checked={
      () => threeOpen,
      (v) => { threeOpen = v; updateThreeOpen(threeOpen); if (threeOpen) allOpen = false; }
    } class="accent-accent-blue" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: PASS

- [ ] **Step 5: Run full unit test suite**

Run: `bunx vitest run`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```
git add src/app/components/setup/RulesetInput.svelte tests/app/components/SetupView.test.ts
git commit -m 'feat: add All Open checkbox with mutual exclusion in RulesetInput'
```

---

### Task 7: E2E — Fix existing tests for new visibility modes

The default is now "hidden" (all opponent cards unknown). Existing E2E tests that fill both hands without enabling a visibility rule will fail validation. Additionally, the Three Open test that starts with 0 opponent cards (5 unknowns) now violates the "exactly 2 nulls" rule.

**Files:**
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/game-flow.test.ts`
- Modify: `tests/e2e/undo.test.ts`
- Modify: `tests/e2e/reset.test.ts`
- Modify: `tests/e2e/swap.test.ts`
- Modify: `tests/e2e/three-open.test.ts`
- Modify: `tests/e2e/visual.test.ts`

- [ ] **Step 1: Add `enableAllOpen` helper to `tests/e2e/helpers.ts`**

```typescript
/** Enable the All Open visibility rule by clicking the checkbox. */
export async function enableAllOpen(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'All Open' }).click();
}
```

- [ ] **Step 2: Fix `game-flow.test.ts`**

Add `enableAllOpen` import and call it before `fillHands`:

```typescript
import { fillHands, placeCard, enableAllOpen, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('full game flow from setup to completion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged
```

- [ ] **Step 3: Fix `undo.test.ts`**

Add `enableAllOpen` import and call before `fillHands`:

```typescript
import { fillHands, placeCard, enableAllOpen, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('undo returns card to hand and frees board cell', async ({ page }) => {
  await page.goto('/');

  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged
```

- [ ] **Step 4: Fix `reset.test.ts`**

Both tests fill both hands. Add `enableAllOpen` import and call before `fillHands` in both tests.

Additionally, `'reset preserves player hand and clears opponent hand'` checks `topInputs[5]` and `topInputs[6]` expecting empty opponent hand inputs. After reset, `allOpen` is preserved (it's not cleared by `resetGame`), so opponent hand will be editable (not disabled). However, `resetGame` clears `opponentHand` to all nulls, so the stat inputs will be empty. **This test should still pass as-is after adding `enableAllOpen`.**

```typescript
import { fillHands, placeCard, enableAllOpen, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('reset preserves player hand and clears opponent hand', async ({ page }) => {
  await page.goto('/');

  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged

test('reset after swap restores original player hand, not swapped hand', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('checkbox', { name: 'Swap' }).click();
  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged
```

- [ ] **Step 5: Fix `swap.test.ts`**

The swap-only test (line 79) fills both hands without visibility rule — add `enableAllOpen`:

```typescript
import { fillHands, enableAllOpen, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

// Line 79 test:
test('swap flow: enable swap, exchange cards, and start game with swapped hands', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Swap' }).click();
  await enableAllOpen(page);
  // ... rest unchanged
```

The two `swap + three open` tests (lines 6 and 32) use Three Open with 3 opponent cards (2 nulls) — these already match the "exactly 2 nulls" constraint. No changes needed for those.

- [ ] **Step 6: Fix `three-open.test.ts`**

The test `'three open: reveal unknown card and place it'` (line 47) starts Three Open with 0 opponent cards (5 nulls). The new validation requires exactly 2 nulls.

Fix: fill 3 opponent cards before starting, then use reveal flow on the 2 unknown cards:

```typescript
test('three open: reveal unknown card and place it', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('checkbox', { name: 'Three Open' }).click();

  // Fill player hand + 3 opponent cards (leave 2 unknown to match "exactly 2" rule).
  await fillPlayerAndPartialOpponent(page, DEFAULT_PLAYER, DEFAULT_OPPONENT.slice(0, 3));

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'FFXIV Triple Triad Companion' })).toBeVisible();

  // 2 opponent cards should be unknown.
  await expect(page.getByRole('button', { name: '?' })).toHaveCount(2);

  // Turn 1 (Player): place a card.
  await page.getByRole('button', { name: '5 3 7 2' }).click();
  await page.getByRole('button', { name: '·' }).first().click();
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(8);

  // Turn 2 (Opponent): click an unknown card — should open reveal CardInput.
  await page.getByRole('button', { name: '?' }).first().click();

  const statInputs = await page.getByRole('textbox').all();
  expect(statInputs.length).toBe(4);

  // Type stats to reveal: 6 2 7 4.
  await statInputs[0]!.click();
  await page.keyboard.press('6');
  await page.keyboard.press('2');
  await page.keyboard.press('7');
  await page.keyboard.press('4');

  // Unknown count should drop by 1.
  await expect(page.getByRole('button', { name: '?' })).toHaveCount(1);

  // The revealed card should be visible (DOM order: top, left, right, bottom → "6 4 2 7").
  const revealedCard = page.getByRole('button', { name: '6 4 2 7' });
  await expect(revealedCard).toBeVisible();

  // Place the revealed card.
  await revealedCard.click();
  await page.getByRole('button', { name: '·' }).first().click();
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(7);
});
```

The first test (`'three open: start game with unknown opponent cards'`, line 23) fills 3 of 5 opponent cards with Three Open — exactly 2 nulls. No change needed.

- [ ] **Step 7: Fix `visual.test.ts`**

All 4 visual tests fill both hands without enabling a visibility rule. Add `enableAllOpen` before `fillHands` in each test:

```typescript
import { fillHands, placeCard, enableAllOpen, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('setup view with filled hands', async ({ page }) => {
  await page.goto('/');
  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged

test('hand panels at game start', async ({ page }) => {
  await page.goto('/');
  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged

test('board mid-game with placed cards', async ({ page }) => {
  await page.goto('/');
  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged

test('solver suggestion with best move highlight', async ({ page }) => {
  await page.goto('/');
  await enableAllOpen(page);
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  // ... rest unchanged
```

**Note:** The `'setup view with filled hands'` visual test will produce a new screenshot (the "All Open" checkbox is now visible and checked). Update the baseline screenshot after confirming the visual is correct.

- [ ] **Step 8: Run E2E tests**

Run: `bun run test:e2e -- --update-snapshots` (to update visual regression baselines)
Expected: All 13 tests pass.

- [ ] **Step 9: Commit**

```
git add tests/e2e/
git commit -m 'test(e2e): update E2E tests for new visibility mode validation'
```

---

### Task 8: E2E — New hidden mode game flow test

**Files:**
- Create: `tests/e2e/hidden-mode.test.ts`

- [ ] **Step 1: Write hidden mode E2E test**

```typescript
// ABOUTME: E2E test for hidden mode — all opponent cards unknown at game start.
// ABOUTME: Verifies disabled opponent hand in setup, game start with 5 unknowns, and PIMC activation.
import { test, expect } from '@playwright/test';
import { type CardStats, DEFAULT_PLAYER } from './helpers';

/**
 * Fill only the player hand. In hidden mode (default), opponent hand is locked.
 */
async function fillPlayerHand(
  page: import('@playwright/test').Page,
  playerCards: CardStats[],
): Promise<void> {
  const values = playerCards.flat();
  const inputs = await page.getByRole('textbox').all();
  for (let i = 0; i < values.length; i++) {
    await inputs[i]!.click();
    await page.keyboard.press(values[i]!);
  }
}

test('hidden mode: start game with all opponent cards unknown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  // Default mode: neither All Open nor Three Open is checked.
  await expect(page.getByRole('checkbox', { name: 'All Open' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Three Open' })).not.toBeChecked();

  // Opponent hand should show 5 locked "?" cards.
  const questionMarks = page.locator('text=?');
  await expect(questionMarks).toHaveCount(5);

  // Only player hand has editable stat inputs (5 cards * 4 stats = 20 textboxes).
  const inputs = await page.getByRole('textbox').all();
  expect(inputs.length).toBe(20);

  // Fill player hand.
  await fillPlayerHand(page, DEFAULT_PLAYER);

  // Start game.
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'FFXIV Triple Triad Companion' })).toBeVisible();

  // All 5 opponent cards should be unknown "?" buttons.
  await expect(page.getByRole('button', { name: '?' })).toHaveCount(5);
});
```

- [ ] **Step 2: Run E2E tests**

Run: `bun run test:e2e`
Expected: PASS

- [ ] **Step 3: Commit**

```
git add tests/e2e/hidden-mode.test.ts
git commit -m 'test(e2e): add hidden mode game flow test'
```

---

### Task 9: Update ABOUTME comments

**Files:**
- Modify: `src/app/store.ts` (lines 1-2)
- Modify: `src/app/components/setup/RulesetInput.svelte` (line 1)

- [ ] **Step 1: Update ABOUTME comments**

In `src/app/store.ts`, update the ABOUTME to mention all three visibility modes:
```
// ABOUTME: Central Svelte store for the Live Solver app.
// ABOUTME: Holds game phase, hands, ruleset, visibility mode (All Open / Three Open / hidden), history stack, and selected card.
```

In `src/app/components/setup/RulesetInput.svelte`, update the ABOUTME to include "All Open":
```
<!-- ABOUTME: Checkbox inputs for selecting the active ruleset (Plus, Same, Reverse, Fallen Ace, Ascension, Descension, Order, Swap, Three Open, All Open). -->
```

- [ ] **Step 2: Commit**

```
git add src/app/store.ts src/app/components/setup/RulesetInput.svelte
git commit -m 'docs: update ABOUTME comments for All Open visibility mode'
```
