<!-- ABOUTME: Displays one player's hand as 5 fixed slots during gameplay. -->
<!-- ABOUTME: Played cards leave a ghost slot. Highlights the best-move card; allows selection on the active turn only. Dims non-forced cards under Order rule. -->
<script lang="ts">
  import { currentState, rankedMoves, game, selectCard, revealCard } from '../../store';
  import { Owner, type Card } from '../../../engine';
  import { cardModifier, ownerColor } from '../../card-display';
  import RevealableCard from '../shared/RevealableCard.svelte';
  import CardFace from '../CardFace.svelte';

  let { owner }: { owner: Owner } = $props();

  let hand = $derived(
    owner === Owner.Player
      ? ($currentState?.playerHand ?? [])
      : ($currentState?.opponentHand ?? []),
  );

  let initialHand = $derived(
    $game.history[0]
      ? (owner === Owner.Player ? $game.history[0].playerHand : $game.history[0].opponentHand)
      : [],
  );

  let isActive = $derived($currentState?.currentTurn === owner);
  let bestCard = $derived($rankedMoves[0]?.card ?? null);

  let revealingCardId: number | null = $state(null);

  let isOrderActive = $derived($game.ruleset.order);
  let forcedCard = $derived(isOrderActive && isActive ? hand[0] ?? null : null);

  let color = $derived(ownerColor(owner, $game.playerSide));
  let accentBg = $derived(color === 'blue' ? 'bg-accent-blue' : 'bg-accent-red');
  let accentBorder = $derived(color === 'blue' ? 'border-accent-blue' : 'border-accent-red');
  let accentBgDim = $derived(color === 'blue' ? 'bg-accent-blue-dim' : 'bg-accent-red-dim');
  let accentShadow = $derived(color === 'blue' ? 'shadow-accent-blue/20' : 'shadow-accent-red/20');
  let hoverBorder = $derived(color === 'blue' ? 'hover:border-accent-blue' : 'hover:border-accent-red');

  function handleClick(card: Card) {
    if (!isActive) return;
    if (isOrderActive && hand.indexOf(card) !== 0) return;
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
      <span class="w-2 h-2 rounded-full {accentBg} inline-block" title="Active turn"></span>
    {/if}
  </h3>
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
</div>
