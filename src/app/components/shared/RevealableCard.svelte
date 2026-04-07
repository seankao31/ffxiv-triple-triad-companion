<!-- ABOUTME: Wraps the "reveal unknown card" interaction for SwapStep and HandPanel. -->
<!-- ABOUTME: Shows CardInput when revealing, otherwise renders children snippet. -->
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { Card } from '../../../engine';
  import CardInput from '../setup/CardInput.svelte';

  let { revealing, onreveal, children }: {
    revealing: boolean;
    onreveal: (card: Card) => void;
    children: Snippet;
  } = $props();

  let cardInput: { focusFirst: () => void } | null = $state(null);

  $effect(() => {
    if (revealing) {
      tick().then(() => cardInput?.focusFirst());
    }
  });

  function handleChange(card: Card | null) {
    if (!card) return;
    onreveal(card);
  }
</script>

{#if revealing}
  <CardInput onchange={handleChange} bind:this={cardInput} />
{:else}
  {@render children()}
{/if}
