<!-- ABOUTME: Displays the solver's ranked move suggestions with outcome and robustness score. -->
<!-- ABOUTME: Highlights the top move with a ring; shows Win/Draw/Loss label per move. -->
<script lang="ts">
  import { rankedMoves } from '../../store';
  import { Outcome } from '../../../engine';

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
</script>

<div class="flex flex-col gap-2">
  <h3 class="text-xs font-semibold text-surface-400 uppercase tracking-wide">Best Moves</h3>
  <ul class="flex flex-col gap-1">
    {#each $rankedMoves as move, i}
      <li
        class="flex items-center gap-2 text-sm p-2 rounded
          {i === 0 ? 'bg-surface-700 ring-1 ring-accent-gold' : 'bg-surface-800'}"
      >
        <span class="font-mono text-surface-400 w-8">{positionLabel(move.position)}</span>
        <span class="font-semibold {outcomeColor[move.outcome]}">{outcomeLabel[move.outcome]}</span>
        <span class="text-surface-500 text-xs">rob={move.robustness.toFixed(2)}</span>
      </li>
    {/each}
  </ul>
</div>
