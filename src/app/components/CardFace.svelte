<!-- ABOUTME: Pure display of a card's stats in the 3x3 cross layout. -->
<!-- ABOUTME: Renders type badge, modifier overlay, or ? placeholder when unknown. -->
<script lang="ts">
  import type { Card } from '../../engine';
  import { typeAbbrev, typeColor } from '../card-display';

  let {
    card,
    unknown = false,
    modifier = null,
    showType = true,
  }: {
    card: Card;
    unknown?: boolean;
    modifier?: number | null;
    showType?: boolean;
  } = $props();

  function displayValue(v: number): string {
    return v === 10 ? 'A' : String(v);
  }
</script>

{#if unknown}
  <div class="col-span-3 row-span-3 flex items-center justify-center text-lg text-surface-400">?</div>
{:else}
  {@const abbr = showType ? typeAbbrev[card.type] : undefined}
  {@const colorClass = typeColor[card.type]}
  <div class="relative col-span-3 row-span-3 grid grid-cols-3 h-full">
    {#if modifier != null}
      <div class="absolute top-0 left-0.5 text-[10px] font-semibold {modifier > 0 ? 'text-eval-win' : 'text-eval-loss'}">
        {modifier > 0 ? '+' : ''}{modifier}
      </div>
    {/if}
    {#if abbr}
      <div class="absolute top-0 right-0.5 text-[10px] font-semibold {colorClass}">{abbr}</div>
    {/if}
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.top)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.left)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.right)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(card.bottom)}</div>
    <div></div>
  </div>
{/if}
