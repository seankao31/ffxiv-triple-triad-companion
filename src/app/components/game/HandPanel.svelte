<!-- ABOUTME: Displays one player's remaining hand cards during gameplay. -->
<!-- ABOUTME: Highlights the best-move card; allows selection on the active turn only. -->
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
