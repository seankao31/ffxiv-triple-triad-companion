<!-- ABOUTME: Displays one player's remaining hand cards during gameplay. -->
<!-- ABOUTME: Highlights the best-move card; allows selection on the active turn only. -->
<script lang="ts">
  import { currentState, rankedMoves, game, selectCard } from '../../store';
  import { Owner, cardEquals, type Card } from '../../../engine';

  let { owner }: { owner: Owner } = $props();

  let hand = $derived(
    owner === Owner.Player
      ? ($currentState?.playerHand ?? [])
      : ($currentState?.opponentHand ?? []),
  );

  let isActive = $derived($currentState?.currentTurn === owner);
  let bestCard = $derived($rankedMoves[0]?.card ?? null);

  function handleClick(card: Card) {
    if (!isActive) return;
    selectCard(card);
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
    <button
      onclick={() => handleClick(card)}
      class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3
        {isActive ? 'cursor-pointer hover:border-accent-blue' : 'cursor-default opacity-70'}
        {card === $game.selectedCard ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}
        {bestCard && cardEquals(card, bestCard) && isActive ? 'ring-2 ring-accent-gold shadow-lg shadow-accent-gold/20' : ''}"
    >
      <div></div>
      <div class="flex items-center justify-center">{card.top === 10 ? 'A' : card.top}</div>
      <div></div>
      <div class="flex items-center justify-center">{card.left === 10 ? 'A' : card.left}</div>
      <div></div>
      <div class="flex items-center justify-center">{card.right === 10 ? 'A' : card.right}</div>
      <div></div>
      <div class="flex items-center justify-center">{card.bottom === 10 ? 'A' : card.bottom}</div>
      <div></div>
    </button>
  {/each}
</div>
