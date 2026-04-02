<!-- ABOUTME: 3×3 game board. Renders 9 cells, handles card placement, highlights suggested move. -->
<!-- ABOUTME: Derives the highlighted cell from the top-ranked move for the selected card. -->
<script lang="ts">
  import BoardCell from './BoardCell.svelte';
  import { currentState, rankedMoves, game, playCard } from '../../store';
  import { tierOf, type OutcomeTier } from '../../../engine';
  import { cardModifier } from '../../card-display';

  let suggestedPosition = $derived.by(() => {
    const selected = $game.selectedCard;
    if (!selected) return null;
    const move = $rankedMoves.find((m) => m.card.id === selected.id);
    return move?.position ?? null;
  });

  let evalMap = $derived.by(() => {
    const selected = $game.selectedCard;
    if (!selected) return null;
    const map = new Map<number, OutcomeTier>();
    for (const move of $rankedMoves) {
      if (move.card.id === selected.id) {
        map.set(move.position, tierOf(move.score));
      }
    }
    return map;
  });

</script>

<div class="grid grid-cols-3 gap-2">
  {#each Array(9) as _, i}
    <BoardCell
      cell={$currentState?.board[i] ?? null}
      highlighted={suggestedPosition === i}
      evaluation={evalMap?.get(i) ?? null}
      modifier={$currentState?.board[i] ? cardModifier($currentState.board[i]!.card.type, $currentState, $game.ruleset) : null}
      onclick={() => playCard(i)}
    />
  {/each}
</div>
