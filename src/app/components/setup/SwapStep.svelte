<!-- ABOUTME: UI step for resolving a Swap rule exchange before the game begins. -->
<!-- ABOUTME: Lets the player select which card they gave away and which opponent card they received. Unknown opponent cards (Three Open) show a "?" button that expands to inline stat entry. -->
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

  {#snippet playerHandSection()}
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
  {/snippet}

  {#snippet opponentHandSection()}
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
  {/snippet}

  <div class="flex gap-12">
    {#if $game.playerSide === 'left'}
      {@render playerHandSection()}
      {@render opponentHandSection()}
    {:else}
      {@render opponentHandSection()}
      {@render playerHandSection()}
    {/if}
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
