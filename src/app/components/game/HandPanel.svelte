<!-- ABOUTME: Displays one player's remaining hand cards during gameplay. -->
<!-- ABOUTME: Highlights the best-move card; allows selection on the active turn only. -->
<script lang="ts">
  import { currentState, rankedMoves, game, selectCard } from '../../store';
  import { Owner, type Card } from '../../../engine';

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
  <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
    {owner === Owner.Player ? 'Your Hand' : 'Opponent'}
    {isActive ? '(Active)' : ''}
  </h3>
  {#each hand as card}
    <button
      onclick={() => handleClick(card)}
      class="w-16 h-16 rounded border text-xs font-bold grid grid-cols-3
        {isActive ? 'cursor-pointer hover:border-blue-400' : 'cursor-default opacity-70'}
        {card === $game.selectedCard ? 'border-blue-400 bg-blue-900' : 'border-gray-600 bg-gray-800'}
        {card === bestCard && isActive ? 'ring-2 ring-yellow-400' : ''}"
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
