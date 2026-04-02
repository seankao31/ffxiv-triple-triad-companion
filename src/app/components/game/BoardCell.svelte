<!-- ABOUTME: A single cell on the 3×3 board — renders an empty slot or a placed card. -->
<!-- ABOUTME: Ownership is shown via background colour: blue for player, red for opponent. -->
<script lang="ts">
  import type { BoardCell as BoardCellData } from '../../../engine/types';
  import { Owner, type OutcomeTier } from '../../../engine';
  import { typeAbbrev, typeColor } from '../../card-display';

  let {
    cell,
    highlighted = false,
    evaluation = null,
    modifier = null,
    onclick,
  }: {
    cell: BoardCellData;
    highlighted?: boolean;
    evaluation?: OutcomeTier | null;
    modifier?: number | null;
    onclick: () => void;
  } = $props();

  const evalBg: Record<OutcomeTier, string> = {
    win: 'bg-eval-win/20',
    draw: 'bg-eval-draw/20',
    loss: 'bg-eval-loss/20',
  };

  function displayValue(v: number): string {
    return v === 10 ? 'A' : String(v);
  }
</script>

<button
  {onclick}
  data-eval={!cell && evaluation ? evaluation : undefined}
  class="w-24 h-24 border border-surface-600 rounded flex items-center justify-center
    {highlighted ? 'ring-2 ring-accent-gold' : ''}
    {cell
      ? (cell.owner === Owner.Player ? 'bg-accent-blue-dim shadow-inner' : 'bg-accent-red-dim shadow-inner')
      : evaluation
        ? evalBg[evaluation]
        : 'bg-surface-800 hover:bg-surface-700'}"
>
  {#if cell}
    {@const abbr = typeAbbrev[cell.card.type]}
    {@const colorClass = typeColor[cell.card.type]}
    <div class="grid grid-cols-3 gap-0 text-xs font-bold font-mono w-full h-full p-1 relative">
      {#if modifier}
        <div class="absolute top-0.5 left-1 text-[10px] font-semibold {modifier > 0 ? 'text-eval-win' : 'text-eval-loss'}">
          {modifier > 0 ? '+' : ''}{modifier}
        </div>
      {/if}
      {#if abbr}
        <div class="absolute top-0.5 right-1 text-[10px] font-semibold {colorClass}">{abbr}</div>
      {/if}
      <div></div>
      <div class="flex items-center justify-center">{displayValue(cell.card.top)}</div>
      <div></div>
      <div class="flex items-center justify-center">{displayValue(cell.card.left)}</div>
      <div></div>
      <div class="flex items-center justify-center">{displayValue(cell.card.right)}</div>
      <div></div>
      <div class="flex items-center justify-center">{displayValue(cell.card.bottom)}</div>
      <div></div>
    </div>
  {:else}
    <span class="text-surface-500 text-2xl">·</span>
  {/if}
</button>
