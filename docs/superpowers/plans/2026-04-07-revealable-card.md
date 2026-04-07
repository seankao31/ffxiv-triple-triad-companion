# RevealableCard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated reveal-unknown-card interaction from SwapStep and HandPanel into a shared `RevealableCard` component.

**Architecture:** A Svelte 5 component that conditionally renders a `CardInput` (with auto-focus) or a children snippet. Parents provide `revealing: boolean` and `onreveal: (card) => void`, keeping control of which card is revealing and what to do on completion.

**Tech Stack:** Svelte 5, TypeScript, vitest + @testing-library/svelte

---

### File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/components/shared/RevealableCard.svelte` | Shared reveal wrapper — conditional CardInput vs children |
| Create | `tests/app/components/RevealableCard.test.ts` | Unit tests for RevealableCard |
| Modify | `src/app/components/setup/SwapStep.svelte` | Replace direct CardInput usage with RevealableCard |
| Modify | `src/app/components/game/HandPanel.svelte` | Replace direct CardInput usage with RevealableCard |

---

### Task 1: RevealableCard component — TDD

**Files:**
- Create: `tests/app/components/RevealableCard.test.ts`
- Create: `src/app/components/shared/RevealableCard.svelte`

- [x] **Step 1: Write failing test — renders children when not revealing**

```ts
// tests/app/components/RevealableCard.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RevealableCardTest from './RevealableCardTest.svelte';

describe('RevealableCard', () => {
  it('renders children when not revealing', () => {
    render(RevealableCardTest, { props: { revealing: false, onreveal: vi.fn() } });
    expect(screen.getByText('child-content')).toBeInTheDocument();
    expect(screen.queryByLabelText('Top')).not.toBeInTheDocument();
  });
});
```

We need a thin test wrapper because Svelte 5 snippets can't be passed as props from test code. Create the wrapper:

```svelte
<!-- tests/app/components/RevealableCardTest.svelte -->
<script lang="ts">
  import RevealableCard from '../../../src/app/components/shared/RevealableCard.svelte';
  import type { Card } from '../../../src/engine';

  let { revealing = false, onreveal = (_c: Card) => {} }: {
    revealing?: boolean;
    onreveal?: (card: Card) => void;
  } = $props();
</script>

<RevealableCard {revealing} {onreveal}>
  <span>child-content</span>
</RevealableCard>
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/components/RevealableCard.test.ts`
Expected: FAIL — module not found (RevealableCard.svelte doesn't exist yet)

- [x] **Step 3: Write minimal RevealableCard component**

```svelte
<!-- src/app/components/shared/RevealableCard.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Card } from '../../../engine';

  let { revealing, onreveal, children }: {
    revealing: boolean;
    onreveal: (card: Card) => void;
    children: Snippet;
  } = $props();
</script>

{#if revealing}
  <!-- CardInput placeholder — added next -->
{:else}
  {@render children()}
{/if}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/app/components/RevealableCard.test.ts`
Expected: PASS

- [x] **Step 5: Write failing test — shows CardInput when revealing**

Add to the test file:

```ts
  it('shows CardInput when revealing', () => {
    render(RevealableCardTest, { props: { revealing: true, onreveal: vi.fn() } });
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
    expect(screen.queryByText('child-content')).not.toBeInTheDocument();
  });
```

- [x] **Step 6: Run test to verify it fails**

Run: `bunx vitest run tests/app/components/RevealableCard.test.ts`
Expected: FAIL — 'Top' label not found

- [x] **Step 7: Add CardInput rendering**

Update `RevealableCard.svelte` — replace the `<!-- CardInput placeholder -->` comment:

```svelte
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { Card } from '../../../engine';
  import CardInput from '../setup/CardInput.svelte';

  let { revealing, onreveal, children }: {
    revealing: boolean;
    onreveal: (card: Card) => void;
    children: Snippet;
  } = $props();

  let cardInput: { focusFirst: () => void } | null = $state(null);

  function handleChange(card: Card | null) {
    if (!card) return;
    onreveal(card);
  }
</script>

{#if revealing}
  <CardInput onchange={handleChange} bind:this={cardInput} />
{:else}
  {@render children()}
{/if}
```

- [x] **Step 8: Run test to verify it passes**

Run: `bunx vitest run tests/app/components/RevealableCard.test.ts`
Expected: PASS

- [x] **Step 9: Write failing test — auto-focuses Top field**

Add to the test file:

```ts
  it('auto-focuses the Top input when revealing becomes true', async () => {
    const { rerender } = render(RevealableCardTest, { props: { revealing: false, onreveal: vi.fn() } });
    await rerender({ revealing: true, onreveal: vi.fn() });
    expect(document.activeElement).toBe(screen.getByLabelText('Top'));
  });
```

- [x] **Step 10: Run test to verify it fails**

Run: `bunx vitest run tests/app/components/RevealableCard.test.ts`
Expected: FAIL — active element is not the Top input

- [x] **Step 11: Add auto-focus logic using $effect**

Update the script section in `RevealableCard.svelte` — add an `$effect` after the `cardInput` state declaration:

```ts
  $effect(() => {
    if (revealing) {
      tick().then(() => cardInput?.focusFirst());
    }
  });
```

- [x] **Step 12: Run test to verify it passes**

Run: `bunx vitest run tests/app/components/RevealableCard.test.ts`
Expected: PASS

- [x] **Step 13: Write failing test — calls onreveal when CardInput emits a valid card**

Add to the test file:

```ts
  it('calls onreveal when CardInput emits a complete card', async () => {
    const onreveal = vi.fn();
    render(RevealableCardTest, { props: { revealing: true, onreveal } });

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '3' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '4' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '6' });

    expect(onreveal).toHaveBeenCalledOnce();
    expect(onreveal).toHaveBeenCalledWith(
      expect.objectContaining({ top: 3, right: 4, bottom: 5, left: 6 }),
    );
  });
```

Update the import at the top of the test file to include `fireEvent`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
```

- [x] **Step 14: Run test to verify it passes**

Run: `bunx vitest run tests/app/components/RevealableCard.test.ts`
Expected: PASS (the `handleChange` + `onreveal` callback is already wired up from Step 7)

- [x] **Step 15: Commit**

```
git add src/app/components/shared/RevealableCard.svelte tests/app/components/RevealableCard.test.ts tests/app/components/RevealableCardTest.svelte
git commit -m 'feat(ENG-42): add RevealableCard component with tests'
```

---

### Task 2: Refactor SwapStep to use RevealableCard

**Files:**
- Modify: `src/app/components/setup/SwapStep.svelte`

- [x] **Step 1: Run existing SwapStep tests to confirm they pass**

Run: `bunx vitest run tests/app/components/SwapStep.test.ts`
Expected: PASS (all 6 tests)

- [x] **Step 2: Refactor SwapStep**

Replace the `CardInput` import and reveal machinery with `RevealableCard`. The full updated file:

```svelte
<script lang="ts">
  import { game, handleSwap, updateOpponentCard } from '../../store';
  import type { Card } from '../../../engine';
  import RevealableCard from '../shared/RevealableCard.svelte';
  import CardFace from '../CardFace.svelte';

  let selectedGiven: Card | null = $state(null);
  let selectedReceived: Card | null = $state(null);
  let revealingIndex: number | null = $state(null);

  let canConfirm = $derived(selectedGiven !== null && selectedReceived !== null);

  function handleRevealCard(index: number, card: Card) {
    updateOpponentCard(index, card);
    selectedReceived = card;
    revealingIndex = null;
  }

  function confirm() {
    if (!selectedGiven || !selectedReceived) return;
    handleSwap(selectedGiven, selectedReceived);
  }
</script>

<div class="flex flex-col items-center gap-8 p-8">
  <h2 class="text-2xl font-bold">Swap — Exchange Cards</h2>

  <div class="flex gap-12">
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
  </div>

  <button
    onclick={confirm}
    disabled={!canConfirm}
    class="px-8 py-3 text-lg font-semibold tracking-wide rounded
      {canConfirm ? 'bg-accent-blue hover:bg-accent-blue/80' : 'bg-surface-700 text-surface-500 cursor-not-allowed'}"
  >
    Confirm Swap
  </button>
</div>
```

Key changes:
- Removed: `import { tick } from 'svelte'`, `import CardInput`, `revealCardInput` ref, `startReveal()` function
- `handleRevealCard` signature simplified: no longer checks for `null` (RevealableCard only emits valid cards)
- Template: `{#if revealingIndex === i}` block replaced with `<RevealableCard>` wrapper around the existing card/unknown buttons

- [x] **Step 3: Run SwapStep tests**

Run: `bunx vitest run tests/app/components/SwapStep.test.ts`
Expected: PASS (all 6 tests)

- [x] **Step 4: Commit**

```
git add src/app/components/setup/SwapStep.svelte
git commit -m 'refactor(ENG-42): SwapStep uses RevealableCard'
```

---

### Task 3: Refactor HandPanel to use RevealableCard

**Files:**
- Modify: `src/app/components/game/HandPanel.svelte`

- [x] **Step 1: Run existing HandPanel tests to confirm they pass**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`
Expected: PASS (all 11 tests)

- [x] **Step 2: Refactor HandPanel**

Replace the `CardInput` import and reveal machinery with `RevealableCard`. The full updated file:

```svelte
<script lang="ts">
  import { currentState, rankedMoves, game, selectCard, revealCard } from '../../store';
  import { Owner, type Card } from '../../../engine';
  import { cardModifier } from '../../card-display';
  import RevealableCard from '../shared/RevealableCard.svelte';
  import CardFace from '../CardFace.svelte';

  let { owner }: { owner: Owner } = $props();

  let hand = $derived(
    owner === Owner.Player
      ? ($currentState?.playerHand ?? [])
      : ($currentState?.opponentHand ?? []),
  );

  let isActive = $derived($currentState?.currentTurn === owner);
  let bestCard = $derived($rankedMoves[0]?.card ?? null);

  let revealingCardId: number | null = $state(null);

  function handleClick(card: Card) {
    if (!isActive) return;
    if ($game.unknownCardIds.has(card.id)) {
      revealingCardId = card.id;
      return;
    }
    selectCard(card);
  }

  function handleReveal(card: Card) {
    if (revealingCardId === null) return;
    revealCard(revealingCardId, {
      top: card.top, right: card.right, bottom: card.bottom, left: card.left,
    });
    revealingCardId = null;
  }
</script>

<div class="flex flex-col gap-2">
  <h3 class="text-xs font-semibold text-surface-400 uppercase tracking-wide flex items-center gap-2">
    {owner === Owner.Player ? 'Your Hand' : 'Opponent'}
    {#if isActive}
      <span class="w-2 h-2 rounded-full bg-accent-blue inline-block" title="Active turn"></span>
    {/if}
  </h3>
  {#each hand as card}
    {@const isUnknown = $game.unknownCardIds.has(card.id)}
    <RevealableCard revealing={revealingCardId === card.id} onreveal={handleReveal}>
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
    </RevealableCard>
  {/each}
</div>
```

Key changes:
- Removed: `import { tick } from 'svelte'`, `import CardInput`, `revealCardInput` ref
- `handleClick` simplified: no longer calls `await tick()` or `focusFirst()` — just sets `revealingCardId`
- `handleReveal` signature simplified: no longer checks `card` for null
- Template: `{#if isRevealing}` block replaced with `<RevealableCard>` wrapper

- [x] **Step 3: Run HandPanel tests**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`
Expected: PASS (all 11 tests)

- [x] **Step 4: Commit**

```
git add src/app/components/game/HandPanel.svelte
git commit -m 'refactor(ENG-42): HandPanel uses RevealableCard'
```

---

### Task 4: Full test suite verification

- [x] **Step 1: Run all UI tests**

Run: `bunx vitest run`
Expected: All 193+ tests PASS

- [x] **Step 2: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit if any fixes were needed, otherwise done**
