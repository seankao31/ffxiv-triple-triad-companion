<!-- ABOUTME: Thin test wrapper for RevealableCard — passes a snippet as children. -->
<!-- ABOUTME: Needed because Svelte 5 snippets can't be passed as props from test code. -->
<script lang="ts">
  import RevealableCard from '../../../src/app/components/shared/RevealableCard.svelte';
  import type { Card } from '../../../src/engine';

  let { revealing = false, onreveal = (_c: Card) => {} }: {
    revealing?: boolean;
    onreveal?: (card: Card) => void;
  } = $props();
</script>

<RevealableCard {revealing} {onreveal}>
  <span>child-content</span>
</RevealableCard>
