<!-- ABOUTME: Setup phase view — collects both hands and ruleset before starting a game. -->
<!-- ABOUTME: Shows an error alert if Start Game is clicked with incomplete card slots. -->
<script lang="ts">
  import HandInput from './HandInput.svelte';
  import RulesetInput from './RulesetInput.svelte';
  import { game, startGame, updatePlayerCard, updateOpponentCard, updateFirstTurn } from '../../store';
  import { Owner } from '../../../engine';

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

  <fieldset class="flex gap-6 items-center">
    <legend class="text-sm font-semibold text-surface-400 mr-2">First Move</legend>
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input type="radio" name="firstTurn" value={Owner.Player}
        checked={$game.firstTurn === Owner.Player}
        onchange={() => updateFirstTurn(Owner.Player)} />
      You
    </label>
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input type="radio" name="firstTurn" value={Owner.Opponent}
        checked={$game.firstTurn === Owner.Opponent}
        onchange={() => updateFirstTurn(Owner.Opponent)} />
      Opponent
    </label>
  </fieldset>

  <div class="flex gap-12">
    <HandInput label="Your Hand" onchange={updatePlayerCard} />
    <HandInput label="Opponent Hand" onchange={updateOpponentCard} />
  </div>

  {#if error}
    <p role="alert" class="text-accent-red text-sm">{error}</p>
  {/if}

  <button
    onclick={handleStart}
    class="px-6 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded font-semibold"
  >
    Start Game
  </button>
</div>
