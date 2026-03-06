<!-- ABOUTME: Play phase view — board, both hands, solver suggestions, undo, and score display. -->
<!-- ABOUTME: Composes Board, HandPanel, and SolverPanel into the main game layout. -->
<script lang="ts">
  import Board from './Board.svelte';
  import HandPanel from './HandPanel.svelte';
  import SolverPanel from './SolverPanel.svelte';
  import { undoMove, currentState } from '../../store';
  import { Owner, getScore } from '../../../engine';

  let score = $derived(
    $currentState ? getScore($currentState) : { player: 0, opponent: 0 },
  );
</script>

<div class="flex flex-col h-screen p-4">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-lg font-bold">Project Triad</h1>
    <div class="text-sm text-surface-400">
      You: {score.player} — Opponent: {score.opponent}
    </div>
    <button
      onclick={undoMove}
      class="px-3 py-1 bg-surface-700 hover:bg-surface-600 rounded text-sm"
    >
      Undo
    </button>
  </div>

  <div class="flex gap-8 flex-1 items-start justify-center">
    <HandPanel owner={Owner.Player} />
    <Board />
    <HandPanel owner={Owner.Opponent} />
    <SolverPanel />
  </div>
</div>
