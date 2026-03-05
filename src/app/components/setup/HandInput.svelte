<!-- ABOUTME: Renders 5 CardInput slots for one hand (player or opponent). -->
<!-- ABOUTME: Calls onchange with the slot index and card value on each update. -->
<script lang="ts">
  import CardInput from './CardInput.svelte';
  import type { Card } from '../../../engine';

  let {
    label,
    onchange,
  }: {
    label: string;
    onchange: (index: number, card: Card | null) => void;
  } = $props();
</script>

<div>
  <h3 class="text-sm font-semibold text-gray-300 mb-2">{label}</h3>
  <div class="flex flex-col gap-3">
    {#each Array(5) as _, i}
      <CardInput onchange={(card) => onchange(i, card)} />
    {/each}
  </div>
</div>
