<!-- ABOUTME: Play phase view — board, both hands, solver suggestions, undo, and score display. -->
<!-- ABOUTME: Composes ActiveRules, Board, HandPanel, and SolverPanel into the main game layout. -->
<script lang="ts">
  import ActiveRules from './ActiveRules.svelte';
  import Board from './Board.svelte';
  import HandPanel from './HandPanel.svelte';
  import SolverPanel from './SolverPanel.svelte';
  import { undoMove, resetGame, currentState, canUndo, game } from '../../store';
  import { Owner, getScore } from '../../../engine';

  let score = $derived(
    $currentState ? getScore($currentState) : { player: 0, opponent: 0 },
  );
</script>

<div class="flex flex-col h-screen p-4">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-lg font-bold">FFXIV Triple Triad Companion</h1>
    <div class="text-base font-semibold text-surface-300">
      You: {score.player} — Opponent: {score.opponent}
    </div>
    <div class="flex gap-2">
      <button
        onclick={undoMove}
        disabled={!$canUndo}
        class="px-3 py-1 border border-surface-500 rounded text-sm
          {$canUndo ? 'hover:border-surface-400 hover:bg-surface-700' : 'opacity-40 cursor-not-allowed'}"
      >
        Undo
      </button>
      <button
        onclick={resetGame}
        class="px-3 py-1 text-sm text-surface-400 hover:text-surface-300 hover:bg-surface-700 rounded"
      >
        Reset
      </button>
    </div>
  </div>

  <ActiveRules />

  <div data-testid="game-layout" class="flex gap-10 flex-1 items-start justify-center pt-6">
    {#if $game.playerSide === 'left'}
      <HandPanel owner={Owner.Player} />
      <Board />
      <HandPanel owner={Owner.Opponent} />
    {:else}
      <HandPanel owner={Owner.Opponent} />
      <Board />
      <HandPanel owner={Owner.Player} />
    {/if}
    <SolverPanel />
  </div>
</div>
