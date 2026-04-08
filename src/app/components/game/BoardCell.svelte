<!-- ABOUTME: A single cell on the 3×3 board — renders an empty slot or a placed card. -->
<!-- ABOUTME: Ownership colour is side-aware via ownerColor: blue/red depends on playerSide. -->
<script lang="ts">
  import type { BoardCell as BoardCellData } from '../../../engine/types';
  import { type OutcomeTier } from '../../../engine';
  import { game } from '../../store';
  import { ownerColor } from '../../card-display';
  import CardFace from '../CardFace.svelte';

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

  let cellColor = $derived(
    cell ? (ownerColor(cell.owner, $game.playerSide) === 'blue' ? 'bg-accent-blue-dim' : 'bg-accent-red-dim') : ''
  );

  const evalBg: Record<OutcomeTier, string> = {
    win: 'bg-eval-win/20',
    draw: 'bg-eval-draw/20',
    loss: 'bg-eval-loss/20',
  };
</script>

<button
  {onclick}
  data-eval={!cell && evaluation ? evaluation : undefined}
  class="w-24 h-24 border border-surface-600 rounded flex items-center justify-center
    {highlighted ? 'ring-2 ring-accent-gold' : ''}
    {cell
      ? cellColor + ' shadow-inner'
      : evaluation
        ? evalBg[evaluation]
        : 'bg-surface-800 hover:bg-surface-700'}"
>
  {#if cell}
    <div class="text-xs font-bold font-mono w-full h-full p-1">
      <CardFace card={cell.card} {modifier} />
    </div>
  {:else}
    <span class="text-surface-500 text-2xl">·</span>
  {/if}
</button>
