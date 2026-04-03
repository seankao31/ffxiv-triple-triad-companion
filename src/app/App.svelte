<!-- ABOUTME: Root app component. Switches between setup and play views based on game phase. -->
<!-- ABOUTME: Renders SetupView in setup phase and GameView in play phase. -->
<script lang="ts">
  import { game } from './store';
  import SetupView from './components/setup/SetupView.svelte';
  import GameView from './components/game/GameView.svelte';
</script>

{#if $game.phase === 'setup' || $game.phase === 'swap'}
  <SetupView />
{:else}
  <GameView />
{/if}
