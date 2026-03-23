<!-- ABOUTME: Shows card notation and outcome for the best-move tier, adapting header based on whose turn it is. -->
<!-- ABOUTME: Highlights the top move with a ring; shows the shared outcome once in the header. -->
<script lang="ts">
  import { rankedMoves, solverLoading, pimcProgress, currentState, game } from '../../store';
  import { Outcome, Owner, type Card } from '../../../engine';
  import { typeAbbrev, typeColor } from '../../card-display';

  const outcomeLabel: Record<Outcome, string> = {
    [Outcome.Win]: 'Win',
    [Outcome.Draw]: 'Draw',
    [Outcome.Loss]: 'Loss',
  };

  const outcomeColor: Record<Outcome, string> = {
    [Outcome.Win]: 'text-eval-win',
    [Outcome.Draw]: 'text-eval-draw',
    [Outcome.Loss]: 'text-eval-loss',
  };

  function positionLabel(pos: number): string {
    const row = Math.floor(pos / 3) + 1;
    const col = (pos % 3) + 1;
    return `R${row}C${col}`;
  }

  function cardNotation(card: Card): { values: string; typeAbbr: string | null; typeClass: string | null } {
    const vals = [card.top, card.right, card.bottom, card.left]
      .map(v => v === 10 ? 'A' : String(v))
      .join('-');
    const abbr = typeAbbrev[card.type] ?? null;
    const cls = typeColor[card.type] ?? null;
    return { values: vals, typeAbbr: abbr, typeClass: cls };
  }

  let isOpponentTurn = $derived($currentState?.currentTurn === Owner.Opponent);
  let selectedCard = $derived($game.selectedCard);
  let bestTierMoves = $derived.by(() => {
    if ($rankedMoves.length === 0) return [];
    const bestOutcome = $rankedMoves[0]!.outcome;
    return $rankedMoves.filter(m => m.outcome === bestOutcome);
  });
</script>

<div class="flex flex-col gap-2 min-w-52">
  <h3
    class="text-sm font-semibold text-surface-400 uppercase tracking-wide"
    title={isOpponentTurn ? "Outcomes shown from the opponent's perspective. Their 'Win' means you lose." : "Outcomes shown from your perspective."}
  >
    {isOpponentTurn ? "Opponent's Best Moves" : "Best Moves"}
    {#if bestTierMoves.length > 0}
      <span class="normal-case {outcomeColor[bestTierMoves[0]!.outcome]}">— {outcomeLabel[bestTierMoves[0]!.outcome]}</span>
    {/if}
  </h3>
  {#if $solverLoading}
    <div role="status" class="text-surface-400 text-sm animate-pulse">
      {#if $pimcProgress}
        Calculating… ({$pimcProgress.current}/{$pimcProgress.total} simulations)
      {:else}
        Calculating…
      {/if}
    </div>
  {/if}
  <ul class="flex flex-col gap-1">
    {#each bestTierMoves as move, i}
      {@const notation = cardNotation(move.card)}
      <li
        class="flex items-center gap-2 text-sm p-2 rounded
          {i === 0 ? 'bg-surface-700 ring-1 ring-accent-gold' : 'bg-surface-800'}
          {selectedCard && move.card.id === selectedCard.id ? 'border-l-2 border-accent-blue' : ''}"
      >
        <span class="font-mono text-surface-300 text-xs">
          {notation.values}{#if notation.typeAbbr}<span class="{notation.typeClass}">[{notation.typeAbbr}]</span>{/if}
        </span>
        <span class="font-mono text-surface-400 w-8">{positionLabel(move.position)}</span>
        {#if move.confidence !== undefined}
          <span class="text-surface-300 text-xs">{Math.round(move.confidence * 100)}%</span>
        {:else}
          <span class="text-surface-300 text-xs">rob={move.robustness.toFixed(2)}</span>
        {/if}
      </li>
    {/each}
  </ul>
</div>
