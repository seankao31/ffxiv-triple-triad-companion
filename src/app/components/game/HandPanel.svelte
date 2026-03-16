<!-- ABOUTME: Displays one player's remaining hand cards during gameplay. -->
<!-- ABOUTME: Highlights the best-move card; allows selection on the active turn only. -->
<script lang="ts">
  import { currentState, rankedMoves, game, selectCard, revealCard } from '../../store';
  import { Owner, type Card } from '../../../engine';
  import CardInput from '../setup/CardInput.svelte';

  let { owner }: { owner: Owner } = $props();

  let hand = $derived(
    owner === Owner.Player
      ? ($currentState?.playerHand ?? [])
      : ($currentState?.opponentHand ?? []),
  );

  let isActive = $derived($currentState?.currentTurn === owner);
  let bestCard = $derived($rankedMoves[0]?.card ?? null);

  // ID of the unknown card currently being revealed; null when no reveal form is open.
  let revealingCardId: number | null = $state(null);

  function handleClick(card: Card) {
    if (!isActive) return;
    if ($game.unknownCardIds.has(card.id)) {
      revealingCardId = card.id;
      return;
    }
    selectCard(card);
  }

  function handleReveal(card: Card | null) {
    if (!card || revealingCardId === null) return;
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
    {@const isRevealing = revealingCardId === card.id}
    {#if isRevealing}
      <CardInput onchange={handleReveal} />
    {:else}
      <button
        onclick={() => handleClick(card)}
        class="w-20 h-20 rounded border text-xs font-bold font-mono grid grid-cols-3
          {isActive ? 'cursor-pointer hover:border-accent-blue' : 'cursor-default opacity-70'}
          {card === $game.selectedCard ? 'border-accent-blue bg-accent-blue-dim shadow-lg shadow-accent-blue/20' : 'border-surface-600 bg-surface-800'}
          {bestCard && card.id === bestCard.id && isActive ? 'ring-2 ring-accent-gold shadow-lg shadow-accent-gold/20' : ''}"
      >
        {#if isUnknown}
          <div class="col-span-3 row-span-3 flex items-center justify-center text-lg text-surface-400">?</div>
        {:else}
          <div></div>
          <div class="flex items-center justify-center">{card.top === 10 ? 'A' : card.top}</div>
          <div></div>
          <div class="flex items-center justify-center">{card.left === 10 ? 'A' : card.left}</div>
          <div></div>
          <div class="flex items-center justify-center">{card.right === 10 ? 'A' : card.right}</div>
          <div></div>
          <div class="flex items-center justify-center">{card.bottom === 10 ? 'A' : card.bottom}</div>
          <div></div>
        {/if}
      </button>
    {/if}
  {/each}
</div>
