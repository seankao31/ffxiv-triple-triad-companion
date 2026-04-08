# ENG-85: Player Side Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the player choose which visual side (left/right) they sit on during setup. Left is always blue, right is always red.

**Architecture:** Add `playerSide: 'left' | 'right'` to `AppState`. A pure helper function `ownerColor(owner, playerSide)` maps `Owner` to `'blue' | 'red'` based on the chosen side. All components that render blue/red styling or position hands left/right read `playerSide` from the store and use the color mapping.

**Tech Stack:** Svelte 5, TypeScript, Vitest, @testing-library/svelte

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/store.ts` | Modify | Add `playerSide` to `AppState`, `updatePlayerSide()`, reset in `resetGame()` |
| `src/app/card-display.ts` | Modify | Add `ownerColor(owner, playerSide)` helper |
| `src/app/components/setup/SetupView.svelte` | Modify | Add side radio picker, swap hand input order |
| `src/app/components/game/GameView.svelte` | Modify | Swap `HandPanel` render order based on `playerSide` |
| `src/app/components/game/BoardCell.svelte` | Modify | Use `ownerColor` for cell background |
| `src/app/components/game/HandPanel.svelte` | Modify | Use `ownerColor` for turn indicator and selection styling |
| `src/app/components/setup/SwapStep.svelte` | Modify | Swap hand display order based on `playerSide` |
| `tests/app/store.test.ts` | Modify | Tests for `playerSide` state and `updatePlayerSide` |
| `tests/app/card-display.test.ts` | Modify or Create | Tests for `ownerColor` |
| `tests/app/components/SetupView.test.ts` | Modify | Tests for side radio picker and hand order |
| `tests/app/components/GameView.test.ts` | Modify | Tests for hand panel order |
| `tests/app/components/BoardCell.test.ts` | Modify | Tests for color mapping |
| `tests/app/components/HandPanel.test.ts` | Modify | Tests for color mapping |
| `tests/app/components/SwapStep.test.ts` | Modify | Tests for hand display order |

---

### Task 1: Add `ownerColor` helper to `card-display.ts`

**Files:**
- Modify: `src/app/card-display.ts`
- Create or Modify: `tests/app/card-display.test.ts`

- [x] **Step 1: Write the failing tests**

In `tests/app/card-display.test.ts`, add (or create the file with) these tests:

```typescript
import { describe, it, expect } from 'vitest';
import { ownerColor } from '../../src/app/card-display';
import { Owner } from '../../src/engine';

describe('ownerColor', () => {
  it('returns blue for Player when playerSide is left', () => {
    expect(ownerColor(Owner.Player, 'left')).toBe('blue');
  });

  it('returns red for Opponent when playerSide is left', () => {
    expect(ownerColor(Owner.Opponent, 'left')).toBe('red');
  });

  it('returns red for Player when playerSide is right', () => {
    expect(ownerColor(Owner.Player, 'right')).toBe('red');
  });

  it('returns blue for Opponent when playerSide is right', () => {
    expect(ownerColor(Owner.Opponent, 'right')).toBe('blue');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/card-display.test.ts`
Expected: FAIL — `ownerColor` is not exported from `card-display.ts`

- [x] **Step 3: Implement `ownerColor`**

In `src/app/card-display.ts`, add the import for `Owner` and the function:

```typescript
import { CardType, Owner, type GameState, type RuleSet } from '../engine';

export type PlayerSide = 'left' | 'right';
export type SideColor = 'blue' | 'red';

export function ownerColor(owner: Owner, playerSide: PlayerSide): SideColor {
  const playerIsBlue = playerSide === 'left';
  if (owner === Owner.Player) return playerIsBlue ? 'blue' : 'red';
  return playerIsBlue ? 'red' : 'blue';
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/card-display.test.ts`
Expected: PASS — all 4 tests green

- [x] **Step 5: Commit**

```
git add src/app/card-display.ts tests/app/card-display.test.ts
git commit -m 'feat(ENG-85): add ownerColor helper for side-based color mapping'
```

---

### Task 2: Add `playerSide` to store

**Files:**
- Modify: `src/app/store.ts`
- Modify: `tests/app/store.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `tests/app/store.test.ts`:

1. Import `updatePlayerSide` in the existing import block.
2. Add `playerSide: 'left'` to the `beforeEach` `game.set()` call.
3. Add a new `describe('playerSide')` block:

```typescript
describe('playerSide', () => {
  it('defaults to left', () => {
    expect(get(game).playerSide).toBe('left');
  });

  it('updatePlayerSide sets playerSide to right', () => {
    updatePlayerSide('right');
    expect(get(game).playerSide).toBe('right');
  });

  it('resetGame preserves playerSide', () => {
    updatePlayerSide('right');
    // Start a game first so resetGame has history to clear
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh, allOpen: true }));
    startGame();
    resetGame();
    expect(get(game).playerSide).toBe('right');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: FAIL — `playerSide` property doesn't exist, `updatePlayerSide` not exported

- [x] **Step 3: Implement `playerSide` in the store**

In `src/app/store.ts`:

1. Add `playerSide` to the `AppState` type after `unknownCardIds`:

```typescript
  // Visual side the player sits on. Left = blue, right = red.
  playerSide: 'left' | 'right';
```

2. Add `playerSide: 'left'` to `initialAppState`.

3. Add the setter function after `updateAllOpen`:

```typescript
export function updatePlayerSide(side: 'left' | 'right'): void {
  game.update((s) => ({ ...s, playerSide: side }));
}
```

4. In `resetGame()`, do NOT reset `playerSide` (it persists across games — the player's preferred side doesn't change on reset).

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: PASS

Note: Other test files that call `game.set()` in `beforeEach` will now fail because they don't include `playerSide`. Fix each by adding `playerSide: 'left'` to their `game.set()` calls. The affected files are:
- `tests/app/components/SetupView.test.ts`
- `tests/app/components/GameView.test.ts`
- `tests/app/components/HandPanel.test.ts`
- `tests/app/components/SwapStep.test.ts`

Run `bunx vitest run` to verify all tests pass after adding `playerSide: 'left'` to each `beforeEach`.

- [x] **Step 5: Commit**

```
git add src/app/store.ts tests/app/store.test.ts tests/app/components/SetupView.test.ts tests/app/components/GameView.test.ts tests/app/components/HandPanel.test.ts tests/app/components/SwapStep.test.ts
git commit -m 'feat(ENG-85): add playerSide to AppState with updatePlayerSide setter'
```

---

### Task 3: Add side radio picker to SetupView

**Files:**
- Modify: `src/app/components/setup/SetupView.svelte`
- Modify: `tests/app/components/SetupView.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `tests/app/components/SetupView.test.ts`:

```typescript
import { game, startGame, updatePlayerCard, updateOpponentCard, updateFirstTurn, updateThreeOpen, updateAllOpen, updatePlayerSide } from '../../../src/app/store';

// ... in describe('SetupView'):

it('renders a side selector defaulting to Left (Blue)', () => {
  render(SetupView);
  const leftRadio = screen.getByLabelText(/left \(blue\)/i);
  expect(leftRadio).toBeChecked();
});

it('updates playerSide in store when Right (Red) radio is clicked', async () => {
  render(SetupView);
  const rightRadio = screen.getByLabelText(/right \(red\)/i);
  await fireEvent.click(rightRadio);
  expect(get(game).playerSide).toBe('right');
});

it('shows Your Hand on the right when playerSide is right', () => {
  game.update((s) => ({ ...s, playerSide: 'right' }));
  render(SetupView);
  const handLabels = screen.getAllByText(/your hand|opponent hand/i);
  // When player is on the right, Opponent Hand should come first (left), Your Hand second (right)
  expect(handLabels[0]).toHaveTextContent(/opponent hand/i);
  expect(handLabels[1]).toHaveTextContent(/your hand/i);
});

it('shows Your Hand on the left when playerSide is left (default)', () => {
  render(SetupView);
  const handLabels = screen.getAllByText(/your hand|opponent hand/i);
  expect(handLabels[0]).toHaveTextContent(/your hand/i);
  expect(handLabels[1]).toHaveTextContent(/opponent hand/i);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: FAIL — no radio with label "Left (Blue)" exists

- [x] **Step 3: Implement side picker and hand order swap in SetupView**

In `src/app/components/setup/SetupView.svelte`:

1. Add `updatePlayerSide` to the import from `../../store`.

2. Add a "Your Side" fieldset after the "First Move" fieldset (before the hand inputs `div`):

```svelte
<fieldset class="flex gap-6 items-center border-t border-surface-700 pt-4 w-full justify-center">
  <legend class="text-sm font-semibold text-surface-400 mr-2">Your Side</legend>
  <label class="flex items-center gap-2 text-sm cursor-pointer">
    <input type="radio" name="playerSide" value="left"
      checked={$game.playerSide === 'left'}
      onchange={() => updatePlayerSide('left')} />
    Left (Blue)
  </label>
  <label class="flex items-center gap-2 text-sm cursor-pointer">
    <input type="radio" name="playerSide" value="right"
      checked={$game.playerSide === 'right'}
      onchange={() => updatePlayerSide('right')} />
    Right (Red)
  </label>
</fieldset>
```

3. Swap the hand input order based on `playerSide`. Replace the existing `<div class="flex gap-12">` block with:

```svelte
<div class="flex gap-12">
  {#if $game.playerSide === 'left'}
    <HandInput
      label="Your Hand"
      hand={$game.playerHand}
      onchange={updatePlayerCard}
      onadvance={() => opponentHandRef?.focusFirst()}
      bind:this={playerHandRef}
    />
    <HandInput
      label="Opponent Hand"
      onchange={updateOpponentCard}
      onback={() => playerHandRef?.focusLast()}
      allowUnknown={$game.threeOpen}
      disabled={!$game.allOpen && !$game.threeOpen}
      bind:this={opponentHandRef}
    />
  {:else}
    <HandInput
      label="Opponent Hand"
      onchange={updateOpponentCard}
      onadvance={() => playerHandRef?.focusFirst()}
      allowUnknown={$game.threeOpen}
      disabled={!$game.allOpen && !$game.threeOpen}
      bind:this={opponentHandRef}
    />
    <HandInput
      label="Your Hand"
      hand={$game.playerHand}
      onchange={updatePlayerCard}
      onback={() => opponentHandRef?.focusLast()}
      bind:this={playerHandRef}
    />
  {/if}
</div>
```

Note: The `onadvance`/`onback` callbacks swap too — when player is on the right, advancing from the opponent (left) hand goes to the player (right) hand, and going back from the player hand returns to the opponent hand.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/app/components/setup/SetupView.svelte tests/app/components/SetupView.test.ts
git commit -m 'feat(ENG-85): add side radio picker to SetupView with hand order swap'
```

---

### Task 4: Swap HandPanel order in GameView

**Files:**
- Modify: `src/app/components/game/GameView.svelte`
- Modify: `tests/app/components/GameView.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `tests/app/components/GameView.test.ts`:

```typescript
it('renders player hand on the left by default', () => {
  render(GameView);
  const layout = screen.getByTestId('game-layout');
  const headings = layout.querySelectorAll('h3');
  expect(headings[0]).toHaveTextContent(/your hand/i);
  expect(headings[1]).toHaveTextContent(/opponent/i);
});

it('renders player hand on the right when playerSide is right', () => {
  game.update((s) => ({ ...s, playerSide: 'right' }));
  render(GameView);
  const layout = screen.getByTestId('game-layout');
  const headings = layout.querySelectorAll('h3');
  expect(headings[0]).toHaveTextContent(/opponent/i);
  expect(headings[1]).toHaveTextContent(/your hand/i);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/GameView.test.ts`
Expected: The second test FAILs — player hand is always on the left

- [x] **Step 3: Implement HandPanel order swap in GameView**

In `src/app/components/game/GameView.svelte`:

1. Add `game` to the import from `../../store`.

2. Replace the static HandPanel rendering inside the `data-testid="game-layout"` div:

```svelte
<div data-testid="game-layout" class="flex gap-10 flex-1 items-start justify-center pt-6">
  {#if $game.playerSide === 'left'}
    <HandPanel owner={Owner.Player} />
    <Board />
    <HandPanel owner={Owner.Opponent} />
  {:else}
    <HandPanel owner={Owner.Opponent} />
    <Board />
    <HandPanel owner={Owner.Player} />
  {/if}
  <SolverPanel />
</div>
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/GameView.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/app/components/game/GameView.svelte tests/app/components/GameView.test.ts
git commit -m 'feat(ENG-85): swap HandPanel order in GameView based on playerSide'
```

---

### Task 5: Use `ownerColor` in BoardCell

**Files:**
- Modify: `src/app/components/game/BoardCell.svelte`
- Modify: `tests/app/components/BoardCell.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `tests/app/components/BoardCell.test.ts`:

```typescript
import { game } from '../../../src/app/store';

describe('BoardCell owner color', () => {
  it('shows blue background for Player card when playerSide is left', () => {
    game.update((s) => ({ ...s, playerSide: 'left' }));
    const card = createCard(5, 5, 5, 5);
    const { container } = render(BoardCell, {
      props: { cell: { card, owner: Owner.Player }, onclick: () => {} },
    });
    const button = container.querySelector('button')!;
    expect(button.classList.contains('bg-accent-blue-dim')).toBe(true);
  });

  it('shows red background for Player card when playerSide is right', () => {
    game.update((s) => ({ ...s, playerSide: 'right' }));
    const card = createCard(5, 5, 5, 5);
    const { container } = render(BoardCell, {
      props: { cell: { card, owner: Owner.Player }, onclick: () => {} },
    });
    const button = container.querySelector('button')!;
    expect(button.classList.contains('bg-accent-red-dim')).toBe(true);
  });

  it('shows blue background for Opponent card when playerSide is right', () => {
    game.update((s) => ({ ...s, playerSide: 'right' }));
    const card = createCard(5, 5, 5, 5);
    const { container } = render(BoardCell, {
      props: { cell: { card, owner: Owner.Opponent }, onclick: () => {} },
    });
    const button = container.querySelector('button')!;
    expect(button.classList.contains('bg-accent-blue-dim')).toBe(true);
  });
});
```

Also add `playerSide: 'left'` to the `beforeEach` `game.set()` call (if not already done in Task 2), and add the store import.

Note: The existing `BoardCell.test.ts` doesn't currently set up `game` state in `beforeEach`. You'll need to add:

```typescript
import { game } from '../../../src/app/store';

beforeEach(() => {
  resetCardIds();
  game.update((s) => ({ ...s, playerSide: 'left' }));
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/BoardCell.test.ts`
Expected: FAIL — BoardCell doesn't read `playerSide`, always uses hardcoded blue/red

- [x] **Step 3: Implement `ownerColor` in BoardCell**

In `src/app/components/game/BoardCell.svelte`:

1. Add imports:

```typescript
import { game } from '../../store';
import { ownerColor } from '../../card-display';
```

2. Add a derived color:

```typescript
let cellColor = $derived(
  cell ? (ownerColor(cell.owner, $game.playerSide) === 'blue' ? 'bg-accent-blue-dim' : 'bg-accent-red-dim') : ''
);
```

3. Replace the hardcoded color logic in the button class. Change:

```
{cell
  ? (cell.owner === Owner.Player ? 'bg-accent-blue-dim shadow-inner' : 'bg-accent-red-dim shadow-inner')
  : evaluation
    ? evalBg[evaluation]
    : 'bg-surface-800 hover:bg-surface-700'}
```

to:

```
{cell
  ? cellColor + ' shadow-inner'
  : evaluation
    ? evalBg[evaluation]
    : 'bg-surface-800 hover:bg-surface-700'}
```

4. The `Owner` import can be removed if no longer used directly (check — it was only used in the color conditional).

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/BoardCell.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/app/components/game/BoardCell.svelte tests/app/components/BoardCell.test.ts
git commit -m 'feat(ENG-85): use ownerColor in BoardCell for side-aware cell backgrounds'
```

---

### Task 6: Use `ownerColor` in HandPanel

**Files:**
- Modify: `src/app/components/game/HandPanel.svelte`
- Modify: `tests/app/components/HandPanel.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `tests/app/components/HandPanel.test.ts`:

```typescript
describe('HandPanel side color', () => {
  it('shows blue turn indicator when playerSide is left and player is active', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    const indicator = document.querySelector('[title="Active turn"]');
    expect(indicator?.classList.contains('bg-accent-blue')).toBe(true);
  });

  it('shows red turn indicator when playerSide is right and player is active', () => {
    game.update((s) => ({ ...s, playerSide: 'right' }));
    render(HandPanel, { props: { owner: Owner.Player } });
    const indicator = document.querySelector('[title="Active turn"]');
    expect(indicator?.classList.contains('bg-accent-red')).toBe(true);
  });

  it('shows blue selection border when playerSide is left', async () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    const selected = screen.getAllByRole('button').find((b) => b.classList.contains('border-accent-blue'));
    expect(selected).toBeDefined();
  });

  it('shows red selection border when playerSide is right', async () => {
    game.update((s) => ({ ...s, playerSide: 'right' }));
    render(HandPanel, { props: { owner: Owner.Player } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    const selected = screen.getAllByRole('button').find((b) => b.classList.contains('border-accent-red'));
    expect(selected).toBeDefined();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`
Expected: FAIL — HandPanel always uses blue for player

- [x] **Step 3: Implement `ownerColor` in HandPanel**

In `src/app/components/game/HandPanel.svelte`:

1. Add import:

```typescript
import { ownerColor } from '../../card-display';
```

2. Add derived values for the owner's color classes:

```typescript
let color = $derived(ownerColor(owner, $game.playerSide));
let accentBg = $derived(color === 'blue' ? 'bg-accent-blue' : 'bg-accent-red');
let accentBorder = $derived(color === 'blue' ? 'border-accent-blue' : 'border-accent-red');
let accentBgDim = $derived(color === 'blue' ? 'bg-accent-blue-dim' : 'bg-accent-red-dim');
let accentShadow = $derived(color === 'blue' ? 'shadow-accent-blue/20' : 'shadow-accent-red/20');
let hoverBorder = $derived(color === 'blue' ? 'hover:border-accent-blue' : 'hover:border-accent-red');
```

3. Replace hardcoded `bg-accent-blue` in the turn indicator (line 49):

```svelte
<span class="w-2 h-2 rounded-full {accentBg} inline-block" title="Active turn"></span>
```

4. Replace hardcoded color classes in the card button (line 59-63). Change:

```
{isActive && !isDimmed ? 'cursor-pointer hover:border-accent-blue' : 'cursor-default opacity-70'}
{card === $game.selectedCard ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}
```

to:

```
{isActive && !isDimmed ? `cursor-pointer ${hoverBorder}` : 'cursor-default opacity-70'}
{card === $game.selectedCard ? `${accentBorder} ${accentBgDim} shadow-lg ${accentShadow}` : 'border-surface-600 bg-surface-800'}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/app/components/game/HandPanel.svelte tests/app/components/HandPanel.test.ts
git commit -m 'feat(ENG-85): use ownerColor in HandPanel for side-aware styling'
```

---

### Task 7: Swap hand display order in SwapStep

**Files:**
- Modify: `src/app/components/setup/SwapStep.svelte`
- Modify: `tests/app/components/SwapStep.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `tests/app/components/SwapStep.test.ts`:

```typescript
it('shows player hand on the left by default', () => {
  render(SwapStep);
  const headings = screen.getAllByRole('heading', { level: 3 });
  expect(headings[0]).toHaveTextContent(/give away/i);
  expect(headings[1]).toHaveTextContent(/receive/i);
});

it('shows player hand on the right when playerSide is right', () => {
  game.update((s) => ({ ...s, playerSide: 'right' }));
  render(SwapStep);
  const headings = screen.getAllByRole('heading', { level: 3 });
  expect(headings[0]).toHaveTextContent(/receive/i);
  expect(headings[1]).toHaveTextContent(/give away/i);
});
```

Also add `playerSide: 'left'` to the `beforeEach` `game.set()` call if not already done.

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/SwapStep.test.ts`
Expected: The second test FAILs — "give away" is always first

- [x] **Step 3: Implement hand order swap in SwapStep**

In `src/app/components/setup/SwapStep.svelte`:

Replace the `<div class="flex gap-12">` block with a conditional that swaps the two hand sections:

```svelte
<div class="flex gap-12">
  {#if $game.playerSide === 'left'}
    <div>
      <h3 class="text-sm font-semibold text-surface-300 mb-3">Which card did you give away?</h3>
      <div class="flex flex-col gap-2">
        {#each $game.playerHand as card (card?.id)}
          {#if card}
            <button
              onclick={() => selectedGiven = card}
              class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3 cursor-pointer hover:border-accent-blue
                {selectedGiven && selectedGiven.id === card.id ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}"
            >
              <CardFace {card} showType={false} />
            </button>
          {/if}
        {/each}
      </div>
    </div>
    <div>
      <h3 class="text-sm font-semibold text-surface-300 mb-3">Which card did you receive?</h3>
      <div class="flex flex-col gap-2">
        {#each $game.opponentHand as card, i (card?.id ?? -(i + 1))}
          <RevealableCard revealing={revealingIndex === i} onreveal={(c) => handleRevealCard(i, c)}>
            {#if card}
              <button
                onclick={() => selectedReceived = card}
                class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3 cursor-pointer hover:border-accent-blue
                  {selectedReceived && selectedReceived.id === card.id ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}"
              >
                <CardFace {card} showType={false} />
              </button>
            {:else}
              <button
                onclick={() => revealingIndex = i}
                class="w-20 h-20 rounded border border-dashed border-surface-500 text-lg font-bold text-surface-400
                  flex items-center justify-center cursor-pointer hover:border-accent-blue"
              >?</button>
            {/if}
          </RevealableCard>
        {/each}
      </div>
    </div>
  {:else}
    <div>
      <h3 class="text-sm font-semibold text-surface-300 mb-3">Which card did you receive?</h3>
      <div class="flex flex-col gap-2">
        {#each $game.opponentHand as card, i (card?.id ?? -(i + 1))}
          <RevealableCard revealing={revealingIndex === i} onreveal={(c) => handleRevealCard(i, c)}>
            {#if card}
              <button
                onclick={() => selectedReceived = card}
                class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3 cursor-pointer hover:border-accent-blue
                  {selectedReceived && selectedReceived.id === card.id ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}"
              >
                <CardFace {card} showType={false} />
              </button>
            {:else}
              <button
                onclick={() => revealingIndex = i}
                class="w-20 h-20 rounded border border-dashed border-surface-500 text-lg font-bold text-surface-400
                  flex items-center justify-center cursor-pointer hover:border-accent-blue"
              >?</button>
            {/if}
          </RevealableCard>
        {/each}
      </div>
    </div>
    <div>
      <h3 class="text-sm font-semibold text-surface-300 mb-3">Which card did you give away?</h3>
      <div class="flex flex-col gap-2">
        {#each $game.playerHand as card (card?.id)}
          {#if card}
            <button
              onclick={() => selectedGiven = card}
              class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3 cursor-pointer hover:border-accent-blue
                {selectedGiven && selectedGiven.id === card.id ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}"
            >
              <CardFace {card} showType={false} />
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
```

Note: This duplicates the hand rendering markup. A cleaner approach would be to extract each hand into a `{#snippet}` block and render them in the desired order, but that's a refactoring decision for the implementer to make if the duplication feels excessive. The simpler `{#if}/{:else}` approach keeps behavior changes minimal.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/SwapStep.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/app/components/setup/SwapStep.svelte tests/app/components/SwapStep.test.ts
git commit -m 'feat(ENG-85): swap hand display order in SwapStep based on playerSide'
```

---

### Task 8: Full test suite verification

- [x] **Step 1: Run all TS tests**

Run: `bun run test`
Expected: All tests pass (engine tests, store tests, component tests)

- [x] **Step 2: Run type check**

Run: `bunx tsc --noEmit`
Expected: No type errors

- [x] **Step 3: Fix any failures**

If any tests fail, investigate and fix. Common issues:
- Missing `playerSide: 'left'` in test `beforeEach` blocks
- Hardcoded color assertions in existing tests that need updating

- [x] **Step 4: Commit any fixes**

If fixes were needed:
```
git add -u
git commit -m 'fix(ENG-85): fix test failures from playerSide addition'
```
