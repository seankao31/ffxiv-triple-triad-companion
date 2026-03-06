<!-- ABOUTME: Shows card notation, outcome labels, and adapts header based on whose turn it is. -->
<!-- ABOUTME: Highlights the top move with a ring; shows Win/Draw/Loss label per move. -->
<script lang="ts">
  import { rankedMoves, currentState, game } from '../../store';
  import { Outcome, CardType, Owner, type Card } from '../../../engine';

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

  const typeAbbrev: Partial<Record<CardType, string>> = {
    [CardType.Primal]: 'P',
    [CardType.Scion]: 'Sc',
    [CardType.Society]: 'So',
    [CardType.Garlean]: 'G',
  };

  const typeColor: Partial<Record<CardType, string>> = {
    [CardType.Primal]: 'text-type-primal',
    [CardType.Scion]: 'text-type-scion',
    [CardType.Society]: 'text-type-society',
    [CardType.Garlean]: 'text-type-garlean',
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
</script>

<div class="flex flex-col gap-2">
  <h3
    class="text-xs font-semibold text-surface-400 uppercase tracking-wide"
    title={isOpponentTurn ? "Outcomes shown from the opponent's perspective. Their 'Win' means you lose." : "Outcomes shown from your perspective."}
  >
    {isOpponentTurn ? "Opponent's Best Moves" : "Best Moves"}
  </h3>
  <ul class="flex flex-col gap-1">
    {#each $rankedMoves as move, i}
      {@const notation = cardNotation(move.card)}
      <li
        class="flex items-center gap-2 text-sm p-2 rounded
          {i === 0 ? 'bg-surface-700 ring-1 ring-accent-gold' : 'bg-surface-800'}
          {move.card === selectedCard ? 'border-l-2 border-accent-blue' : ''}"
      >
        <span class="font-mono text-surface-300 text-xs">
          {notation.values}{#if notation.typeAbbr}<span class="{notation.typeClass}">[{notation.typeAbbr}]</span>{/if}
        </span>
        <span class="font-mono text-surface-400 w-8">{positionLabel(move.position)}</span>
        <span class="font-semibold {outcomeColor[move.outcome]}">{outcomeLabel[move.outcome]}</span>
        <span class="text-surface-500 text-xs">rob={move.robustness.toFixed(2)}</span>
      </li>
    {/each}
  </ul>
</div>
