# Fixed Hand Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hand slots stay fixed in place — played cards leave a visible ghost slot instead of collapsing.

**Architecture:** UI-only change in `HandPanel.svelte`. Iterate over the initial 5-card hand (from `history[0]`) instead of the current hand. Match cards by ID to determine which slots are still occupied. Empty slots render as a styled placeholder div. No engine, store, solver, or Rust changes.

**Tech Stack:** Svelte 5, Vitest, @testing-library/svelte

**Linear:** ENG-84  
**Branch:** `eng-84-hand-slots-are-fixed-in-place-played-cards-leave-an-empty-gap`

---

### Task 1: Write failing tests for fixed hand slot behavior

**Files:**
- Modify: `tests/app/components/HandPanel.test.ts`

- [ ] **Step 1: Add test — renders 5 slots with a ghost slot after playing a card**

Add this test inside the existing `describe('HandPanel', ...)` block (after the "renders 5 cards" test at line 119):

```ts
it('renders a ghost slot after a card is played', () => {
  // Play the first player card at position 0
  const hand = get(currentState)!.playerHand;
  selectCard(hand[0]!);
  playCard(0);
  // Opponent's turn — play opponent card at position 1 so it's player turn again
  const oppHand = get(currentState)!.opponentHand;
  selectCard(oppHand[0]!);
  playCard(1);

  rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
  render(HandPanel, { props: { owner: Owner.Player } });

  // 4 remaining cards are buttons; 1 played card is a ghost slot
  expect(screen.getAllByRole('button')).toHaveLength(4);
  expect(screen.getAllByTestId('empty-hand-slot')).toHaveLength(1);
});
```

- [ ] **Step 2: Add `undoMove` to imports and add undo test**

First, add `undoMove` to the store import on line 6:

```ts
import { game, startGame, selectCard, playCard, undoMove, rankedMoves, currentState, updateThreeOpen, revealCard, updateRuleset } from '../../../src/app/store';
```

Then add this test right after the previous one:

```ts
it('restores a card to its original slot after undo', () => {
  const hand = get(currentState)!.playerHand;
  selectCard(hand[0]!);
  playCard(0);
  const oppHand = get(currentState)!.opponentHand;
  selectCard(oppHand[0]!);
  playCard(1);

  undoMove();
  undoMove();

  rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
  render(HandPanel, { props: { owner: Owner.Player } });

  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.queryByTestId('empty-hand-slot')).toBeNull();
});
```

- [ ] **Step 3: Add test — ghost slot does not appear when game history is empty (setup phase)**

Add this test in the same describe block:

```ts
it('renders no slots when history is empty (setup phase)', () => {
  game.update((s) => ({ ...s, phase: 'setup', history: [] }));
  render(HandPanel, { props: { owner: Owner.Player } });
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryByTestId('empty-hand-slot')).toBeNull();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`

Expected: The "ghost slot" test fails because the current implementation renders 4 buttons and no `empty-hand-slot` test IDs. The "undo" test fails because it also expects `empty-hand-slot` queries to work. The "setup phase" test may pass since an empty history already renders nothing.

- [ ] **Step 5: Commit failing tests**

```
git add tests/app/components/HandPanel.test.ts
git commit -m 'test(ENG-84): add failing tests for fixed hand slots'
```

---

### Task 2: Implement fixed hand slots in HandPanel

**Files:**
- Modify: `src/app/components/game/HandPanel.svelte`

- [ ] **Step 1: Add `initialHand` derived state**

In the `<script>` block, after the existing `hand` derived (line 12-16), add:

```ts
let initialHand = $derived(
  $game.history[0]
    ? (owner === Owner.Player ? $game.history[0].playerHand : $game.history[0].opponentHand)
    : [],
);
```

This derives the 5-card starting hand from the first history entry. Empty when history is empty (setup phase).

- [ ] **Step 2: Replace the `{#each}` iteration**

Replace the current iteration block (lines 59-75):

```svelte
{#each hand as card (card.id)}
  {@const isUnknown = $game.unknownCardIds.has(card.id)}
  {@const isForced = forcedCard !== null && card === forcedCard}
  {@const isDimmed = isOrderActive && isActive && !isForced}
  <RevealableCard revealing={revealingCardId === card.id} onreveal={handleReveal}>
    <button
      onclick={() => handleClick(card)}
      class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3
        {isActive && !isDimmed ? `cursor-pointer ${hoverBorder}` : 'cursor-default opacity-70'}
        {card === $game.selectedCard ? `${accentBorder} ${accentBgDim} shadow-lg ${accentShadow}` : 'border-surface-600 bg-surface-800'}
        {bestCard && card.id === bestCard.id && isActive ? 'ring-2 ring-accent-gold shadow-lg shadow-accent-gold/20' : ''}
        {isUnknown ? 'border-dashed' : ''}"
    >
      <CardFace {card} unknown={isUnknown} modifier={cardModifier(card.type, $currentState, $game.ruleset)} />
    </button>
  </RevealableCard>
{/each}
```

With:

```svelte
{#each initialHand as slot (slot.id)}
  {@const card = hand.find(c => c.id === slot.id) ?? null}
  {#if card}
    {@const isUnknown = $game.unknownCardIds.has(card.id)}
    {@const isForced = forcedCard !== null && card === forcedCard}
    {@const isDimmed = isOrderActive && isActive && !isForced}
    <RevealableCard revealing={revealingCardId === card.id} onreveal={handleReveal}>
      <button
        onclick={() => handleClick(card)}
        class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3
          {isActive && !isDimmed ? `cursor-pointer ${hoverBorder}` : 'cursor-default opacity-70'}
          {card === $game.selectedCard ? `${accentBorder} ${accentBgDim} shadow-lg ${accentShadow}` : 'border-surface-600 bg-surface-800'}
          {bestCard && card.id === bestCard.id && isActive ? 'ring-2 ring-accent-gold shadow-lg shadow-accent-gold/20' : ''}
          {isUnknown ? 'border-dashed' : ''}"
      >
        <CardFace {card} unknown={isUnknown} modifier={cardModifier(card.type, $currentState, $game.ruleset)} />
      </button>
    </RevealableCard>
  {:else}
    <div data-testid="empty-hand-slot" class="w-20 h-20 rounded border border-dashed border-surface-700 bg-surface-900"></div>
  {/if}
{/each}
```

- [ ] **Step 3: Update the ABOUTME comments**

Update line 1-2 to reflect the new behavior:

```svelte
<!-- ABOUTME: Displays one player's hand as 5 fixed slots during gameplay. -->
<!-- ABOUTME: Played cards leave a ghost slot. Highlights the best-move card; allows selection on the active turn only. -->
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`

Expected: All tests pass, including the new ghost-slot and undo tests.

- [ ] **Step 5: Run the full UI test suite**

Run: `bunx vitest run`

Expected: All 258+ tests pass. No regressions.

- [ ] **Step 6: Commit**

```
git add src/app/components/game/HandPanel.svelte tests/app/components/HandPanel.test.ts
git commit -m 'feat(ENG-84): fixed hand slots with ghost slot for played cards'
```
