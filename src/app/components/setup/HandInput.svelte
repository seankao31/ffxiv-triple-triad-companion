<!-- ABOUTME: Renders 5 CardInput slots for one hand (player or opponent). -->
<!-- ABOUTME: Wires auto-advance between cards and exposes focusFirst for cross-hand navigation. -->
<script lang="ts">
  import CardInput from './CardInput.svelte';
  import type { Card } from '../../../engine';

  let {
    label,
    onchange,
    onadvance = () => {},
  }: {
    label: string;
    onchange: (index: number, card: Card | null) => void;
    onadvance?: () => void;
  } = $props();

  let cardRefs: Array<{ focusFirst: () => void } | undefined> = $state(Array(5).fill(undefined));

  export function focusFirst() {
    cardRefs[0]?.focusFirst();
  }
</script>

<div>
  <h3 class="text-sm font-semibold text-surface-300 mb-3">{label}</h3>
  <div class="flex flex-col gap-4">
    {#each Array(5) as _, i}
      <CardInput
        onchange={(card) => onchange(i, card)}
        onadvance={i < 4 ? () => cardRefs[i + 1]?.focusFirst() : onadvance}
        bind:this={cardRefs[i]}
      />
    {/each}
  </div>
</div>
