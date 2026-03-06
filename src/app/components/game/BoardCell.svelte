<!-- ABOUTME: A single cell on the 3×3 board — renders an empty slot or a placed card. -->
<!-- ABOUTME: Ownership is shown via background colour: blue for player, red for opponent. -->
<script lang="ts">
  import type { BoardCell as BoardCellData } from '../../../engine/types';
  import { Owner } from '../../../engine';

  let {
    cell,
    highlighted = false,
    onclick,
  }: {
    cell: BoardCellData;
    highlighted?: boolean;
    onclick: () => void;
  } = $props();

  function displayValue(v: number): string {
    return v === 10 ? 'A' : String(v);
  }
</script>

<button
  {onclick}
  class="w-20 h-20 border border-surface-600 rounded flex items-center justify-center
    {highlighted ? 'ring-2 ring-accent-gold' : ''}
    {cell ? (cell.owner === Owner.Player ? 'bg-accent-blue-dim' : 'bg-accent-red-dim') : 'bg-surface-800 hover:bg-surface-700'}"
>
  {#if cell}
    <div class="grid grid-cols-3 gap-0 text-xs font-bold w-full h-full p-1">
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
