# Phase 2 UI Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the Phase 2 UI based on user feedback: dark theme, card-shaped inputs with auto-advance, first-move selection, solver panel clarity, card notation in move list, and per-card board evaluation.

**Architecture:** All changes are UI-only. No engine modifications needed. The store gains one new field (`firstTurn`). CardInput is redesigned with single-char keypress handling and inter-card focus management. Board gains outcome overlays derived from the existing `rankedMoves` store. The frontend-design skill should be invoked for the theme/color system.

**Tech Stack:** Svelte 5, Tailwind CSS v4, TypeScript (strict + noUncheckedIndexedAccess), Vitest + @testing-library/svelte

---

### Task 1: Dark Theme Foundation

Apply a consistent dark gray-purple theme across the entire app. Currently GameView has `bg-gray-900` but SetupView and the body have no background.

**Files:**
- Modify: `src/app/app.css`
- Modify: `src/app/components/setup/SetupView.svelte`
- Modify: `index.html`

**Step 1: Define CSS custom properties and apply dark background**

In `src/app/app.css`, add custom properties for the color palette and set body defaults:

```css
@import "tailwindcss";

@theme {
  --color-surface-900: #1a1625;
  --color-surface-800: #231e30;
  --color-surface-700: #2e2840;
  --color-surface-600: #3d3556;
  --color-surface-500: #504869;
  --color-surface-400: #8a82a0;
  --color-surface-300: #b0a9c0;
  --color-accent-blue: #4a90d9;
  --color-accent-blue-dim: #2a4a7a;
  --color-accent-red: #d94a4a;
  --color-accent-red-dim: #7a2a2a;
  --color-accent-gold: #d4a843;
  --color-eval-win: #3ddc84;
  --color-eval-draw: #d4a843;
  --color-eval-loss: #d94a8a;
  --color-type-primal: #e05555;
  --color-type-scion: #d4a843;
  --color-type-society: #4caf50;
  --color-type-garlean: #4a90d9;
}

body {
  background-color: var(--color-surface-900);
  color: var(--color-surface-300);
}
```

**Step 2: Update SetupView to use new surface colors**

Replace the hardcoded gray classes in `SetupView.svelte`:
- Container: `bg-gray-900` is no longer needed (body handles it); keep `text-white` or switch to `text-surface-300`

**Step 3: Update GameView to use new surface colors**

Replace `bg-gray-900 text-white` with the new palette equivalents.

**Step 4: Run all tests to verify nothing breaks**

Run: `bunx vitest run`
Expected: All 37 tests pass (styling changes should not affect tests)

**Step 5: Visually verify in browser**

Run: `bun run dev`
Check: Both setup and game views have consistent dark purple-gray background

**Step 6: Commit**

```
git add src/app/app.css src/app/components/setup/SetupView.svelte src/app/components/game/GameView.svelte index.html
git commit -m "style: apply dark gray-purple theme across entire app"
```

---

### Task 2: Store — Add firstTurn Field

**Files:**
- Modify: `src/app/store.ts`
- Modify: `tests/app/store.test.ts`

**Step 1: Write failing test for firstTurn in store**

Add to `tests/app/store.test.ts` in the `setup` describe block:

```typescript
it('defaults firstTurn to Player', () => {
  expect(get(game).firstTurn).toBe(Owner.Player);
});
```

Add to the `startGame` describe block:

```typescript
it('respects firstTurn when creating initial state', () => {
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  ph.forEach((c, i) => updatePlayerCard(i, c));
  oh.forEach((c, i) => updateOpponentCard(i, c));
  updateFirstTurn(Owner.Opponent);
  startGame();
  expect(get(currentState)!.currentTurn).toBe(Owner.Opponent);
});
```

**Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: FAIL — `firstTurn` not in AppState, `updateFirstTurn` not exported

**Step 3: Implement firstTurn in store**

In `src/app/store.ts`:
- Add `firstTurn: Owner` to `AppState`
- Add `firstTurn: Owner.Player` to `initialAppState`
- Export `updateFirstTurn(turn: Owner)` function
- Pass `s.firstTurn` to `createInitialState` in `startGame`
- Update `beforeEach` in test to include `firstTurn: Owner.Player`

**Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All pass

**Step 5: Commit**

```
git add src/app/store.ts tests/app/store.test.ts
git commit -m "feat: add firstTurn field to store"
```

---

### Task 3: Setup — First Move Selection

**Files:**
- Modify: `src/app/components/setup/SetupView.svelte`
- Modify: `tests/app/components/SetupView.test.ts`

**Step 1: Write failing test**

Add to `tests/app/components/SetupView.test.ts`:

```typescript
import { Owner } from '../../../src/engine';

it('renders a first-move selector defaulting to Player', () => {
  render(SetupView);
  const playerRadio = screen.getByLabelText(/you/i);
  expect(playerRadio).toBeChecked();
});

it('updates firstTurn in store when Opponent is selected', async () => {
  render(SetupView);
  await fireEvent.click(screen.getByLabelText(/opponent/i));
  expect(get(game).firstTurn).toBe(Owner.Opponent);
});
```

**Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: FAIL — no matching elements

**Step 3: Implement first-move radio in SetupView**

Add a radio group in `SetupView.svelte` between the RulesetInput and the hand inputs:

```svelte
<fieldset class="flex gap-4 items-center">
  <legend class="text-sm font-semibold text-surface-400">First Move</legend>
  <label class="flex items-center gap-2">
    <input type="radio" name="firstTurn" value={Owner.Player}
      checked={$game.firstTurn === Owner.Player}
      onchange={() => updateFirstTurn(Owner.Player)} />
    You
  </label>
  <label class="flex items-center gap-2">
    <input type="radio" name="firstTurn" value={Owner.Opponent}
      checked={$game.firstTurn === Owner.Opponent}
      onchange={() => updateFirstTurn(Owner.Opponent)} />
    Opponent
  </label>
</fieldset>
```

Import `updateFirstTurn` from store and `Owner` from engine.

**Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/SetupView.test.ts`
Expected: All pass

**Step 5: Also update the beforeEach in SetupView.test.ts to include firstTurn**

The `game.set()` in beforeEach needs `firstTurn: Owner.Player` now.

**Step 6: Commit**

```
git add src/app/components/setup/SetupView.svelte tests/app/components/SetupView.test.ts
git commit -m "feat: add first-move selection to setup view"
```

---

### Task 4: CardInput Redesign — Card-Shaped with Auto-Advance

This is the most complex task. The CardInput needs to:
- Render as a card shape with visible border and type dropdown at top-right
- Accept single-char keypress: 1-9, "A"/"a" for 10, "0" for 10
- Auto-advance focus to next field, then to next card across hands

This requires inter-component focus coordination. Approach: CardInput exposes a `focusFirst()` method or accepts a `ref` system. HandInput and SetupView wire up the chain.

**Files:**
- Modify: `src/app/components/setup/CardInput.svelte`
- Modify: `src/app/components/setup/HandInput.svelte`
- Modify: `src/app/components/setup/SetupView.svelte`
- Modify: `tests/app/components/CardInput.test.ts`

**Step 1: Write failing tests for single-char input behavior**

Add to `tests/app/components/CardInput.test.ts`:

```typescript
it('interprets "A" keypress as value 10', async () => {
  const onchange = vi.fn();
  render(CardInput, { props: { onchange, onadvance: vi.fn() } });
  const top = screen.getByLabelText('Top');
  await fireEvent.keyDown(top, { key: 'a' });
  // After filling all 4 with 'a':
  const right = screen.getByLabelText('Right');
  await fireEvent.keyDown(right, { key: 'a' });
  const bottom = screen.getByLabelText('Bottom');
  await fireEvent.keyDown(bottom, { key: 'a' });
  const left = screen.getByLabelText('Left');
  await fireEvent.keyDown(left, { key: 'a' });
  expect(onchange).toHaveBeenLastCalledWith(
    expect.objectContaining({ top: 10, right: 10, bottom: 10, left: 10 }),
  );
});

it('interprets "0" keypress as value 10', async () => {
  const onchange = vi.fn();
  render(CardInput, { props: { onchange, onadvance: vi.fn() } });
  await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '0' });
  await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '5' });
  await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
  await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '5' });
  expect(onchange).toHaveBeenLastCalledWith(
    expect.objectContaining({ top: 10, right: 5, bottom: 5, left: 5 }),
  );
});

it('calls onadvance after filling the last field (left)', async () => {
  const onadvance = vi.fn();
  render(CardInput, { props: { onchange: vi.fn(), onadvance } });
  await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
  await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '5' });
  await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
  await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '5' });
  expect(onadvance).toHaveBeenCalledOnce();
});

it('auto-advances focus from top to right on valid keypress', async () => {
  render(CardInput, { props: { onchange: vi.fn(), onadvance: vi.fn() } });
  const top = screen.getByLabelText('Top');
  top.focus();
  await fireEvent.keyDown(top, { key: '5' });
  expect(document.activeElement).toBe(screen.getByLabelText('Right'));
});
```

**Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/CardInput.test.ts`
Expected: FAIL — onadvance prop not accepted, keyDown not handled

**Step 3: Rewrite CardInput with keypress handling and card layout**

Key implementation details:
- Change input type from `number` to `text` with `inputmode="numeric"` and `maxlength="1"`
- Handle `keydown` event: map key to value (1-9 direct, "a"/"A"/"0" → 10)
- On valid key: set the field value, emit card if complete, advance focus
- Focus order within card: top → right → bottom → left
- After left is filled, call `onadvance` prop (parent handles next card)
- Expose `focusFirst()` via `bind:this` or an exported function
- Card-shaped layout: bordered container, cross layout for values, type dropdown at top-right

```svelte
<script lang="ts">
  import { createCard, CardType, type Card } from '../../../engine';

  let {
    onchange,
    onadvance = () => {},
  }: {
    onchange: (card: Card | null) => void;
    onadvance?: () => void;
  } = $props();

  let values = $state<(number | null)[]>([null, null, null, null]);
  let type = $state<CardType>(CardType.None);
  let inputs: HTMLInputElement[] = [];
  // Field order: 0=top, 1=right, 2=bottom, 3=left

  const fieldLabels = ['Top', 'Right', 'Bottom', 'Left'];

  function displayValue(v: number | null): string {
    if (v === null) return '';
    return v === 10 ? 'A' : String(v);
  }

  function parseKey(key: string): number | null {
    if (key >= '1' && key <= '9') return parseInt(key);
    if (key === '0' || key === 'a' || key === 'A') return 10;
    return null;
  }

  function emit() {
    const [t, r, b, l] = values;
    if (t !== null && r !== null && b !== null && l !== null) {
      onchange(createCard(t, r, b, l, type));
    } else {
      onchange(null);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent) {
    const parsed = parseKey(e.key);
    if (parsed === null) return;
    e.preventDefault();
    values[index] = parsed;
    emit();
    if (index < 3) {
      inputs[index + 1]?.focus();
    } else {
      onadvance();
    }
  }

  function onTypeChange(e: Event) {
    type = (e.target as HTMLSelectElement).value as CardType;
    emit();
  }

  export function focusFirst() {
    inputs[0]?.focus();
  }
</script>
```

The template uses a card-shaped bordered container with the cross layout and type dropdown at top-right. The exact Tailwind classes should be determined during implementation using the theme colors from Task 1.

**Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/CardInput.test.ts`
Expected: All pass

**Step 5: Update HandInput to wire onadvance between cards**

`HandInput.svelte` needs to:
- Hold refs to each CardInput
- Wire `onadvance` on card N to call `focusFirst()` on card N+1
- Accept an `onadvance` prop itself (for cross-hand advance: player hand → opponent hand)
- Export `focusFirst()` that delegates to the first CardInput

**Step 6: Update SetupView to wire cross-hand advance**

Wire player HandInput's `onadvance` to opponent HandInput's `focusFirst()`.

**Step 7: Run full test suite**

Run: `bunx vitest run`
Expected: All tests pass

**Step 8: Commit**

```
git add src/app/components/setup/CardInput.svelte src/app/components/setup/HandInput.svelte src/app/components/setup/SetupView.svelte tests/app/components/CardInput.test.ts
git commit -m "feat: redesign CardInput as card-shaped with single-char auto-advance"
```

---

### Task 5: SolverPanel — Card Notation and Opponent Turn Clarity

**Files:**
- Modify: `src/app/components/game/SolverPanel.svelte`
- Modify: `tests/app/components/SolverPanel.test.ts`

**Step 1: Write failing tests**

Add to `tests/app/components/SolverPanel.test.ts`:

```typescript
it('displays card values in move notation (e.g. "A-A-A-A")', () => {
  render(SolverPanel);
  const items = screen.getAllByRole('listitem');
  // All player cards are 10-10-10-10, displayed as A-A-A-A
  expect(items[0]!.textContent).toContain('A-A-A-A');
});
```

For opponent turn header test, we need to set up a game where it's the opponent's turn:

```typescript
it('shows "Opponent Best Moves" header when it is the opponent turn', () => {
  // Play one move so it becomes opponent's turn
  const ph = makePlayerHand();
  selectCard(ph[0]!);
  playCard(0);

  render(SolverPanel);
  expect(screen.getByText(/opponent/i)).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/SolverPanel.test.ts`
Expected: FAIL — no card notation in output

**Step 3: Implement card notation and dynamic header**

Add a `cardNotation` helper:

```typescript
function cardNotation(card: Card): string {
  const vals = [card.top, card.right, card.bottom, card.left]
    .map(v => v === 10 ? 'A' : String(v))
    .join('-');
  if (card.type === CardType.None) return vals;
  const typeAbbrev: Record<CardType, string> = {
    [CardType.None]: '',
    [CardType.Primal]: 'P',
    [CardType.Scion]: 'Sc',
    [CardType.Society]: 'So',
    [CardType.Garlean]: 'G',
  };
  return vals;  // Type indicator rendered separately with color
}
```

Type indicator rendered as a colored `<span>` next to the card values:

```typescript
const typeColor: Record<CardType, string> = {
  [CardType.None]: '',
  [CardType.Primal]: 'text-type-primal',
  [CardType.Scion]: 'text-type-scion',
  [CardType.Society]: 'text-type-society',
  [CardType.Garlean]: 'text-type-garlean',
};
```

Dynamic header: read `$currentState?.currentTurn` and show "Opponent's Best Moves" vs "Best Moves" accordingly. Add a `title` attribute (tooltip) explaining outcome perspective.

**Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/SolverPanel.test.ts`
Expected: All pass

**Step 5: Commit**

```
git add src/app/components/game/SolverPanel.svelte tests/app/components/SolverPanel.test.ts
git commit -m "feat: add card notation to move list and opponent turn clarity"
```

---

### Task 6: Per-Card Board Evaluation

When a card is selected, show outcome overlays on empty board cells and highlight matching entries in SolverPanel.

**Files:**
- Modify: `src/app/components/game/Board.svelte`
- Modify: `src/app/components/game/BoardCell.svelte`
- Modify: `src/app/components/game/SolverPanel.svelte`
- Modify: `tests/app/components/Board.test.ts`

**Step 1: Write failing tests for board evaluation overlay**

Add to `tests/app/components/Board.test.ts`:

```typescript
it('shows outcome overlays on empty cells when a card is selected', async () => {
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
  startGame();
  selectCard(ph[0]!);

  const { container } = render(Board);
  // All empty cells should have an evaluation overlay (bg-eval-*)
  const evalCells = container.querySelectorAll('[data-eval]');
  expect(evalCells.length).toBe(9);
});
```

**Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/Board.test.ts`
Expected: FAIL — no data-eval attributes

**Step 3: Implement evaluation map in Board**

In `Board.svelte`, derive a map from position → outcome for the selected card:

```typescript
let evalMap = $derived.by(() => {
  const selected = $game.selectedCard;
  if (!selected) return null;
  const map = new Map<number, Outcome>();
  for (const move of $rankedMoves) {
    if (move.card === selected) {
      map.set(move.position, move.outcome);
    }
  }
  return map;
});
```

Pass the evaluation outcome to each BoardCell:

```svelte
<BoardCell
  cell={$currentState?.board[i] ?? null}
  highlighted={suggestedPosition === i}
  evaluation={evalMap?.get(i) ?? null}
  onclick={() => playCard(i)}
/>
```

**Step 4: Update BoardCell to render evaluation overlay**

Add `evaluation` prop to BoardCell. When non-null and cell is empty, apply background color:

```typescript
const evalBg: Record<Outcome, string> = {
  [Outcome.Win]: 'bg-eval-win/20',
  [Outcome.Draw]: 'bg-eval-draw/20',
  [Outcome.Loss]: 'bg-eval-loss/20',
};
```

Add `data-eval={evaluation}` attribute for testing.

**Step 5: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/Board.test.ts`
Expected: All pass

**Step 6: Add selected-card highlighting to SolverPanel**

In `SolverPanel.svelte`, import `game` store and check if each move's card matches `$game.selectedCard`. Apply a distinct highlight (e.g., `border-l-2 border-accent-blue`) different from the yellow "best move" ring.

**Step 7: Run full test suite**

Run: `bunx vitest run`
Expected: All tests pass

**Step 8: Commit**

```
git add src/app/components/game/Board.svelte src/app/components/game/BoardCell.svelte src/app/components/game/SolverPanel.svelte tests/app/components/Board.test.ts
git commit -m "feat: show per-card evaluation overlays on board and highlight in solver panel"
```

---

### Task 7: Theme Polish Pass

Use the frontend-design skill to refine the visual design across all components. This task covers:
- Component sizing (game view elements rendered larger)
- Typography and spacing
- Button styles
- Card visual consistency between setup inputs and game hand panels
- Border treatments and shadows
- Ensuring eval overlay colors are distinct from ownership blue/red

**Files:** All `.svelte` component files

**Step 1: Invoke the frontend-design skill**

Review all components and apply consistent, polished styling using the color system from Task 1.

**Step 2: Run full test suite**

Run: `bunx vitest run`
Expected: All tests pass

**Step 3: Visual verification in browser**

Check both setup and game views look polished and cohesive.

**Step 4: Commit**

```
git add -u
git commit -m "style: polish theme across all components"
```

---

### Task 8: Final Integration Test (original scope)

**Step 1: Run all tests**

```
bun run test
```

Expected: All engine tests (30) and app tests pass.

**Step 2: Type check**

```
bunx tsc --noEmit
```

Expected: No errors.

**Step 3: Manual smoke test**

1. Setup page: enter cards using single-char keys, verify auto-advance
2. Select "Opponent" goes first
3. Start game
4. Verify solver shows opponent's best moves with card notation
5. Select a card — verify board shows colored eval overlays
6. Verify solver panel highlights matching entries
7. Play through a few moves, verify undo works

**Step 4: Final commit if any adjustments needed**

---

## Post-Implementation Tasks (issues 7–10)

These tasks address bugs discovered after the initial six features shipped.

---

### Task 9: Fix CardInput Type Dropdown Overlap

The type dropdown (`w-14`) at `top-1 right-1` overlaps the Top and Right number inputs inside the `w-28 h-28` card container.

**Files:**
- Modify: `src/app/components/setup/CardInput.svelte`
- Modify: `tests/app/components/CardInput.test.ts`

**Step 1: Write failing test**

Add to `tests/app/components/CardInput.test.ts`:

```typescript
it('type dropdown does not visually overlap the number inputs', () => {
  const { container } = render(CardInput, { props: { onchange: vi.fn() } });
  const select = container.querySelector('select')!;
  const topInput = screen.getByLabelText('Top');
  const rightInput = screen.getByLabelText('Right');
  const selectRect = select.getBoundingClientRect();
  const topRect = topInput.getBoundingClientRect();
  const rightRect = rightInput.getBoundingClientRect();
  // Dropdown bottom must not extend into the Top input area
  expect(selectRect.bottom).toBeLessThanOrEqual(topRect.top + 1);
  // Dropdown left must not extend into the Right input area
  expect(selectRect.left).toBeGreaterThanOrEqual(rightRect.right - 1);
});
```

> Note: happy-dom returns zeroed `getBoundingClientRect` values, so this test may need to verify the structural layout via CSS classes instead. An acceptable alternative: verify the card container has the expected larger size class (e.g., `w-36`).

**Step 2: Run test to confirm it fails**

Run: `bunx vitest run tests/app/components/CardInput.test.ts`

**Step 3: Increase card container size**

In `CardInput.svelte`, change the outer container from `w-28 h-28` to a size that gives the dropdown room (e.g., `w-36 h-36`). Adjust internal padding and input sizing as needed to fill the space cleanly.

**Step 4: Run test to confirm it passes**

Run: `bunx vitest run tests/app/components/CardInput.test.ts`

**Step 5: Commit**

```
git add src/app/components/setup/CardInput.svelte tests/app/components/CardInput.test.ts
git commit -m "fix: increase card container size to prevent dropdown overlap"
```

---

### Task 10: Update Engine Tests with Distinct Cards

The existing performance test uses asymmetric hands that deduplicate to 1 unique card each, making it meaningless as a regression test.

**Files:**
- Modify: `tests/engine/solver.test.ts`

**Step 1: Inspect the current performance test**

Read `tests/engine/solver.test.ts` to find the existing performance test (currently uses all-10s player / all-1s opponent hands or similar).

**Step 2: Replace test hands with 10 distinct cards**

```typescript
// 5 distinct player cards
const playerHand = [
  createCard(10, 5, 3, 8),
  createCard(7, 6, 4, 9),
  createCard(2, 8, 6, 3),
  createCard(5, 4, 7, 1),
  createCard(9, 3, 2, 6),
];
// 5 distinct opponent cards (no duplicates with player)
const opponentHand = [
  createCard(4, 7, 5, 2),
  createCard(8, 3, 9, 6),
  createCard(1, 5, 8, 4),
  createCard(6, 9, 1, 7),
  createCard(3, 2, 4, 10),
];
```

Tighten timeout to 25 seconds (observed: ~21s, 25s gives headroom without being dangerously lenient).

**Step 3: Run the performance test**

Run: `bun test tests/engine/solver.test.ts`
Expected: PASS within 25 seconds.

**Step 4: Commit**

```
git add tests/engine/solver.test.ts
git commit -m "test: use distinct cards in solver performance test"
```

---

### Task 11: Refactor Solver — Persistent Transposition Table

Export a `createSolver()` factory so callers can hold a persistent TT across game turns.

**Files:**
- Modify: `src/engine/solver.ts`
- Modify: `tests/engine/solver.test.ts`

**Step 1: Write failing test for createSolver factory**

Add to `tests/engine/solver.test.ts`:

```typescript
import { createSolver } from '../../src/engine/solver';

describe('createSolver', () => {
  it('returns a solver instance with solve() and reset()', () => {
    const solver = createSolver();
    expect(typeof solver.solve).toBe('function');
    expect(typeof solver.reset).toBe('function');
  });

  it('solve() returns the same moves as findBestMove() for the same state', () => {
    const playerHand = [/* same distinct hands as Task 10 */];
    const opponentHand = [/* same distinct hands as Task 10 */];
    const state = createInitialState(playerHand, opponentHand, defaultRuleSet(), Owner.Player);
    const solver = createSolver();
    solver.reset(playerHand, opponentHand);
    const solverMoves = solver.solve(state);
    const directMoves = findBestMove(state);
    expect(solverMoves.map(m => m.outcome)).toEqual(directMoves.map(m => m.outcome));
  });

  it('reuses TT across solve() calls (second call is faster than first)', () => {
    const playerHand = [/* distinct hands */];
    const opponentHand = [/* distinct hands */];
    const state = createInitialState(playerHand, opponentHand, defaultRuleSet(), Owner.Player);
    const solver = createSolver();
    solver.reset(playerHand, opponentHand);

    const t0 = performance.now();
    solver.solve(state);
    const firstCallMs = performance.now() - t0;

    const t1 = performance.now();
    solver.solve(state); // same state — TT is already warm
    const secondCallMs = performance.now() - t1;

    expect(secondCallMs).toBeLessThan(firstCallMs / 10);
  });
});
```

**Step 2: Run tests to confirm they fail**

Run: `bun test tests/engine/solver.test.ts`
Expected: FAIL — `createSolver` not exported.

**Step 3: Implement createSolver factory in solver.ts**

Add to `src/engine/solver.ts`:

```typescript
export interface Solver {
  reset(playerHand: Card[], opponentHand: Card[]): void;
  solve(state: GameState): RankedMove[];
}

export function createSolver(): Solver {
  let tt = new Map<number, TTEntry>();
  let cardIndex = new Map<number, number>();

  return {
    reset(playerHand: Card[], opponentHand: Card[]) {
      tt = new Map();
      cardIndex = new Map();
      let nextIdx = 1;
      for (const card of [...playerHand, ...opponentHand]) {
        const id = cardId(card);
        if (!cardIndex.has(id)) cardIndex.set(id, nextIdx++);
      }
    },
    solve(state: GameState): RankedMove[] {
      return findBestMoveWith(state, tt, cardIndex);
    },
  };
}
```

Refactor `findBestMove` to delegate to an internal `findBestMoveWith(state, tt, cardIndex)` function. `findBestMove` creates a fresh TT and cardIndex then calls `findBestMoveWith` — backward-compatible for engine tests.

`reset()` builds the card index from the **full initial hands** (not the current `state.playerHand` which shrinks as cards are played). This is important: `buildCardIndex` on mid-game state would miss played cards, breaking the hash.

**Step 4: Run tests to confirm they pass**

Run: `bun test tests/engine/solver.test.ts`

**Step 5: Commit**

```
git add src/engine/solver.ts tests/engine/solver.test.ts
git commit -m "feat: add createSolver factory with persistent transposition table"
```

---

### Task 12: Web Worker

**Files:**
- Create: `src/engine/solver.worker.ts`

**Step 1: Write the worker file**

The worker holds a single `Solver` instance. It receives two message types and posts results back:

```typescript
// ABOUTME: Web Worker entry point for the minimax solver.
// ABOUTME: Maintains a persistent solver instance across turns of a single game.
import { createSolver } from './solver';
import type { GameState, Card, RankedMove } from './types';

type InMessage =
  | { type: 'newGame'; playerHand: Card[]; opponentHand: Card[] }
  | { type: 'solve'; state: GameState };

type OutMessage =
  | { type: 'result'; moves: RankedMove[] };

const solver = createSolver();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'newGame') {
    solver.reset(msg.playerHand, msg.opponentHand);
  } else if (msg.type === 'solve') {
    const moves = solver.solve(msg.state);
    self.postMessage({ type: 'result', moves } satisfies OutMessage);
  }
};
```

Workers are not unit-tested directly (they require a real browser or Worker-compatible environment). The correctness of `createSolver` is tested in Task 11. Worker integration is covered by the store tests (Task 13).

**Step 2: Commit**

```
git add src/engine/solver.worker.ts
git commit -m "feat: add solver Web Worker"
```

---

### Task 13: Update Store for Async Solver

**Files:**
- Modify: `src/app/store.ts`
- Modify: `tests/app/store.test.ts`
- Modify: `tests/app/setup.ts`

**Step 1: Add Worker mock to test setup**

In `tests/app/setup.ts`, add a global `Worker` mock before any tests run:

```typescript
import { vi } from 'vitest';

// Mock Worker so store tests don't attempt to load solver.worker.ts
vi.stubGlobal('Worker', class {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage(_msg: unknown) {}
  terminate() {}
});
```

**Step 2: Write failing tests for async solver in store**

Add to `tests/app/store.test.ts`:

```typescript
it('solverLoading is false initially', () => {
  expect(get(solverLoading)).toBe(false);
});

it('startGame sets solverLoading to true while worker computes', () => {
  // With mocked worker that never responds, loading stays true after startGame
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  ph.forEach((c, i) => updatePlayerCard(i, c));
  oh.forEach((c, i) => updateOpponentCard(i, c));
  startGame();
  expect(get(solverLoading)).toBe(true);
});
```

**Step 3: Run tests to confirm they fail**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: FAIL — `solverLoading` not exported.

**Step 4: Refactor store to use Worker**

In `src/app/store.ts`:

1. Change `rankedMoves` from `derived` to `writable<RankedMove[]>([])`
2. Add `export const solverLoading = writable<boolean>(false)`
3. Create Worker singleton:
   ```typescript
   const solverWorker = new Worker(
     new URL('../engine/solver.worker.ts', import.meta.url),
     { type: 'module' }
   );
   solverWorker.onmessage = (e) => {
     if (e.data.type === 'result') {
       rankedMoves.set(e.data.moves);
       solverLoading.set(false);
     }
   };
   ```
4. Add `triggerSolve(state: GameState)` helper:
   ```typescript
   function triggerSolve(state: GameState) {
     solverLoading.set(true);
     solverWorker.postMessage({ type: 'solve', state });
   }
   ```
5. Subscribe `currentState` to trigger solve on change:
   ```typescript
   currentState.subscribe((state) => {
     if (state) triggerSolve(state);
   });
   ```
6. In `startGame()`, after `game.update(...)`:
   ```typescript
   const state = get(currentState)!;
   solverWorker.postMessage({ type: 'newGame', playerHand: s.playerHand, opponentHand: s.opponentHand });
   triggerSolve(state);
   ```
7. In `resetGame()`, clear `rankedMoves` and `solverLoading`.

**Step 5: Run tests to confirm they pass**

Run: `bunx vitest run tests/app/store.test.ts`

**Step 6: Run full test suite**

Run: `bunx vitest run`
Expected: All tests pass.

**Step 7: Commit**

```
git add src/app/store.ts tests/app/store.test.ts tests/app/setup.ts
git commit -m "feat: run solver in Web Worker with persistent transposition table"
```

---

### Task 14: SolverPanel Loading Indicator

**Files:**
- Modify: `src/app/components/game/SolverPanel.svelte`
- Modify: `tests/app/components/SolverPanel.test.ts`

**Step 1: Write failing test**

Add to `tests/app/components/SolverPanel.test.ts`:

```typescript
it('shows a loading indicator when solverLoading is true', () => {
  solverLoading.set(true);
  render(SolverPanel);
  expect(screen.getByRole('status')).toBeInTheDocument();
});

it('hides the loading indicator when solverLoading is false', () => {
  solverLoading.set(false);
  render(SolverPanel);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
```

**Step 2: Run tests to confirm they fail**

Run: `bunx vitest run tests/app/components/SolverPanel.test.ts`

**Step 3: Add loading indicator to SolverPanel**

Import `solverLoading` from store. When `$solverLoading` is true, render a spinner or "Calculating…" text with `role="status"`:

```svelte
{#if $solverLoading}
  <div role="status" class="text-surface-400 text-sm animate-pulse">Calculating…</div>
{/if}
```

**Step 4: Run full test suite**

Run: `bunx vitest run`

**Step 5: Commit**

```
git add src/app/components/game/SolverPanel.svelte tests/app/components/SolverPanel.test.ts
git commit -m "feat: show loading indicator in SolverPanel while solver runs"
```

---

### Task 15: Final Integration Test (post-implementation)

**Step 1: Run all tests**

```
bun run test
```

Expected: All engine tests and app tests pass.

**Step 2: Type check**

```
bunx tsc --noEmit
```

Expected: No errors.

**Step 3: Manual smoke test**

1. Enter 10 distinct cards in setup (5 player, 5 opponent)
2. Click "Start Game" — UI remains responsive while "Calculating…" appears
3. Solver panel populates with results when Worker finishes (~21s from opening)
4. Play a card — "Calculating…" appears briefly, resolves fast (<1ms)
5. Undo — same: brief loading indicator, fast result
6. Verify board eval overlays still work when a card is selected
7. Start a new game — solver resets cleanly
