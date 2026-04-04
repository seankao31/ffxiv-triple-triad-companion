# CardFace Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated card stat rendering into a shared `CardFace` component; unify unknown-card visual treatment with dashed borders.

**Architecture:** A new `CardFace.svelte` pure display component replaces inline 3x3 stat grids in SwapStep, HandPanel, and BoardCell. The component handles stat formatting, type badge, and modifier overlay. Callers keep their own button wrappers and add `border-dashed` for unknown cards.

**Tech Stack:** Svelte 5, TypeScript, Tailwind CSS v4, Vitest + @testing-library/svelte

**Spec:** `docs/superpowers/specs/2026-04-05-cardface-extraction-design.md`
**Linear:** ENG-41

---

### Task 1: Create `CardFace` component with tests

**Files:**
- Create: `src/app/components/CardFace.svelte`
- Create: `tests/app/components/CardFace.test.ts`

- [ ] **Step 1: Write failing tests for CardFace**

```ts
// tests/app/components/CardFace.test.ts
// ABOUTME: Tests for CardFace — pure display of card stats in cross layout.
// ABOUTME: Validates stat formatting, type badge, modifier overlay, and unknown placeholder.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createCard, CardType, resetCardIds } from '../../../src/engine';
import CardFace from '../../../src/app/components/CardFace.svelte';

beforeEach(() => {
  resetCardIds();
});

describe('CardFace stat display', () => {
  it('renders all four stat values', () => {
    const card = createCard(3, 7, 2, 9);
    render(CardFace, { props: { card } });
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('renders 10 as A', () => {
    const card = createCard(10, 10, 10, 10);
    render(CardFace, { props: { card } });
    const aces = screen.getAllByText('A');
    expect(aces).toHaveLength(4);
  });
});

describe('CardFace type badge', () => {
  it('shows type abbreviation for Primal card', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(CardFace, { props: { card } });
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('hides type badge when showType is false', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(CardFace, { props: { card, showType: false } });
    expect(screen.queryByText('P')).not.toBeInTheDocument();
  });

  it('shows no type badge for None-type card', () => {
    const card = createCard(5, 5, 5, 5, CardType.None);
    render(CardFace, { props: { card } });
    expect(screen.queryByText('P')).not.toBeInTheDocument();
    expect(screen.queryByText('Sc')).not.toBeInTheDocument();
    expect(screen.queryByText('So')).not.toBeInTheDocument();
    expect(screen.queryByText('G')).not.toBeInTheDocument();
  });
});

describe('CardFace modifier', () => {
  it('shows positive modifier', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card, modifier: 2 } });
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows negative modifier', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card, modifier: -1 } });
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('does not show modifier when null', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card } });
    expect(screen.queryByText(/^\+\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d$/)).not.toBeInTheDocument();
  });
});

describe('CardFace unknown', () => {
  it('shows ? placeholder when unknown', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card, unknown: true } });
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('does not show stats when unknown', () => {
    const card = createCard(3, 7, 2, 9);
    render(CardFace, { props: { card, unknown: true } });
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/CardFace.test.ts`
Expected: FAIL — module `CardFace.svelte` not found

- [ ] **Step 3: Implement CardFace component**

```svelte
<!-- src/app/components/CardFace.svelte -->
<!-- ABOUTME: Pure display of a card's stats in the 3x3 cross layout. -->
<!-- ABOUTME: Renders type badge, modifier overlay, or ? placeholder when unknown. -->
<script lang="ts">
  import type { Card } from '../../engine';
  import { typeAbbrev, typeColor } from '../card-display';

  let {
    card,
    unknown = false,
    modifier = null,
    showType = true,
  }: {
    card: Card;
    unknown?: boolean;
    modifier?: number | null;
    showType?: boolean;
  } = $props();

  function displayValue(v: number): string {
    return v === 10 ? 'A' : String(v);
  }
</script>

{#if unknown}
  <div class="col-span-3 row-span-3 flex items-center justify-center text-lg text-surface-400">?</div>
{:else}
  {@const abbr = showType ? typeAbbrev[card.type] : undefined}
  {@const colorClass = typeColor[card.type]}
  <div class="relative col-span-3 row-span-3 grid grid-cols-3">
    {#if modifier}
      <div class="absolute top-0 left-0.5 text-[10px] font-semibold {modifier > 0 ? 'text-eval-win' : 'text-eval-loss'}">
        {modifier > 0 ? '+' : ''}{modifier}
      </div>
    {/if}
    {#if abbr}
      <div class="absolute top-0 right-0.5 text-[10px] font-semibold {colorClass}">{abbr}</div>
    {/if}
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.top)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.left)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.right)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.bottom)}</div>
    <div></div>
  </div>
{/if}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/CardFace.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/components/CardFace.svelte tests/app/components/CardFace.test.ts
git commit -m 'feat: add CardFace shared display component (ENG-41)'
```

---

### Task 2: Replace inline stats in HandPanel with CardFace

**Files:**
- Modify: `src/app/components/game/HandPanel.svelte`
- Test: `tests/app/components/HandPanel.test.ts` (existing — must still pass)

- [ ] **Step 1: Replace the stat rendering in HandPanel**

In `HandPanel.svelte`, add the import:

```ts
import CardFace from '../CardFace.svelte';
```

Remove the `cardModifier` import from `'../../card-display'` (it will move into the template via CardFace's `modifier` prop). Keep the `typeAbbrev` and `typeColor` imports only if still used elsewhere in the file — they won't be after this change, so remove the entire `card-display` import line.

Replace the button interior (the `{#if isUnknown}` block, lines 65-90) with:

```svelte
      <button
        onclick={() => handleClick(card)}
        class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3
          {isActive ? 'cursor-pointer hover:border-accent-blue' : 'cursor-default opacity-70'}
          {card === $game.selectedCard ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}
          {bestCard && card.id === bestCard.id && isActive ? 'ring-2 ring-accent-gold shadow-lg shadow-accent-gold/20' : ''}
          {isUnknown ? 'border-dashed' : ''}"
      >
        <CardFace {card} unknown={isUnknown} modifier={cardModifier(card.type, $currentState, $game.ruleset)} />
      </button>
```

Since `cardModifier` is now called inline, keep that import but remove `typeAbbrev` and `typeColor` imports from `card-display`. The `cardModifier` import stays from `'../../card-display'`.

- [ ] **Step 2: Run existing HandPanel tests**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/components/game/HandPanel.svelte
git commit -m 'refactor(HandPanel): use CardFace for stat rendering (ENG-41)'
```

---

### Task 3: Replace inline stats in SwapStep with CardFace

**Files:**
- Modify: `src/app/components/setup/SwapStep.svelte`
- Test: `tests/app/components/SwapStep.test.ts` (existing — must still pass)

- [ ] **Step 1: Replace stat rendering in SwapStep**

In `SwapStep.svelte`, add the import:

```ts
import CardFace from '../CardFace.svelte';
```

Replace the player card button interior (lines 51-59) with:

```svelte
            <button
              onclick={() => selectedGiven = card}
              class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3 cursor-pointer hover:border-accent-blue
                {selectedGiven && selectedGiven.id === card.id ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}"
            >
              <CardFace {card} showType={false} />
            </button>
```

Replace the known opponent card button interior (lines 78-87) with:

```svelte
            <button
              onclick={() => selectedReceived = card}
              class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3 cursor-pointer hover:border-accent-blue
                {selectedReceived && selectedReceived.id === card.id ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}"
            >
              <CardFace {card} showType={false} />
            </button>
```

The unknown opponent card button (lines 89-93) keeps its existing `border-dashed` — no change needed there since it already has the correct styling and doesn't render stats.

- [ ] **Step 2: Run existing SwapStep tests**

Run: `bunx vitest run tests/app/components/SwapStep.test.ts`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/components/setup/SwapStep.svelte
git commit -m 'refactor(SwapStep): use CardFace for stat rendering (ENG-41)'
```

---

### Task 4: Replace inline stats in BoardCell with CardFace

**Files:**
- Modify: `src/app/components/game/BoardCell.svelte`
- Test: `tests/app/components/BoardCell.test.ts` (existing — must still pass)

- [ ] **Step 1: Replace stat rendering in BoardCell**

In `BoardCell.svelte`, add the import:

```ts
import CardFace from '../CardFace.svelte';
```

Remove the `typeAbbrev` and `typeColor` imports from `'../../card-display'`. Remove the local `displayValue` function.

Replace the card rendering block (lines 44-65) with:

```svelte
  {#if cell}
    <div class="text-xs font-bold font-mono w-full h-full p-1">
      <CardFace card={cell.card} {modifier} />
    </div>
  {:else}
    <span class="text-surface-500 text-2xl">·</span>
  {/if}
```

Note: The outer `<div>` provides the `w-full h-full p-1` sizing that was previously on the grid div. The `grid grid-cols-3 gap-0` and `relative` styles are now inside CardFace.

- [ ] **Step 2: Run existing BoardCell tests**

Run: `bunx vitest run tests/app/components/BoardCell.test.ts`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/components/game/BoardCell.svelte
git commit -m 'refactor(BoardCell): use CardFace for stat rendering (ENG-41)'
```

---

### Task 5: Run full test suite and verify

**Files:** None — verification only.

- [ ] **Step 1: Run all UI tests**

Run: `bunx vitest run`
Expected: All 175+ tests PASS

- [ ] **Step 2: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run E2E tests**

Run: `bun run test:e2e`
Expected: All 4 E2E tests PASS

- [ ] **Step 4: Update card-display.ts ABOUTME comment**

The ABOUTME comment in `src/app/card-display.ts` says "Used by BoardCell, HandPanel, and SolverPanel." After this refactor, it's used by CardFace and SolverPanel (and HandPanel for `cardModifier` only). Update:

```ts
// ABOUTME: Shared card display helpers for type labels and modifier calculation.
// ABOUTME: Used by CardFace, HandPanel, and SolverPanel.
```

- [ ] **Step 5: Commit**

```bash
git add src/app/card-display.ts
git commit -m 'chore: update card-display ABOUTME after CardFace extraction (ENG-41)'
```
