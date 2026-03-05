<!-- ABOUTME: Setup phase view — collects both hands and ruleset before starting a game. -->
<!-- ABOUTME: Shows an error alert if Start Game is clicked with incomplete card slots. -->
<script lang="ts">
  import HandInput from './HandInput.svelte';
  import RulesetInput from './RulesetInput.svelte';
  import { startGame, updatePlayerCard, updateOpponentCard } from '../../store';

  let error = $state('');

  function handleStart() {
    try {
      error = '';
      startGame();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Please fill all card slots before starting.';
    }
  }
</script>

<div class="flex flex-col items-center gap-8 p-8">
  <h1 class="text-2xl font-bold">Project Triad — Setup</h1>

  <RulesetInput />

  <div class="flex gap-12">
    <HandInput label="Your Hand" onchange={updatePlayerCard} />
    <HandInput label="Opponent Hand" onchange={updateOpponentCard} />
  </div>

  {#if error}
    <p role="alert" class="text-red-400 text-sm">{error}</p>
  {/if}

  <button
    onclick={handleStart}
    class="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
  >
    Start Game
  </button>
</div>
