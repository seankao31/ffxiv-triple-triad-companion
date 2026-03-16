<!-- ABOUTME: Renders 5 CardInput slots for one hand (player or opponent). -->
<!-- ABOUTME: Wires auto-advance and back-navigation between cards; exposes focusFirst/focusLast. -->
<script lang="ts">
  import CardInput from './CardInput.svelte';
  import type { Card } from '../../../engine';

  let {
    label,
    onchange,
    onadvance = () => {},
    onback = () => {},
    allowUnknown = false,
  }: {
    label: string;
    onchange: (index: number, card: Card | null) => void;
    onadvance?: () => void;
    onback?: () => void;
    allowUnknown?: boolean;
  } = $props();

  let cardRefs: Array<{ focusFirst: () => void; focusLast: () => void } | undefined> = $state(Array(5).fill(undefined));

  export function focusFirst() {
    cardRefs[0]?.focusFirst();
  }

  export function focusLast() {
    cardRefs[4]?.focusLast();
  }
</script>

<div>
  <h3 class="text-sm font-semibold text-surface-300 mb-3">{label}</h3>
  <div class="flex flex-col gap-4">
    {#each Array(5) as _, i}
      <CardInput
        onchange={(card) => onchange(i, card)}
        onadvance={i < 4 ? () => cardRefs[i + 1]?.focusFirst() : onadvance}
        onback={i > 0 ? () => cardRefs[i - 1]?.focusLast() : onback}
        {allowUnknown}
        bind:this={cardRefs[i]}
      />
    {/each}
  </div>
</div>
