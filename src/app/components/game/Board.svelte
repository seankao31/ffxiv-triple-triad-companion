<!-- ABOUTME: 3×3 game board. Renders 9 cells, handles card placement, highlights suggested move. -->
<!-- ABOUTME: Derives the highlighted cell from the top-ranked move for the selected card. -->
<script lang="ts">
  import BoardCell from './BoardCell.svelte';
  import { currentState, rankedMoves, game, playCard } from '../../store';
  import { Outcome, type BoardCell as BoardCellData, type GameState, type RuleSet } from '../../../engine';
  import { boardTypeCount, typeAbbrev } from '../../card-display';

  let suggestedPosition = $derived.by(() => {
    const selected = $game.selectedCard;
    if (!selected) return null;
    const move = $rankedMoves.find((m) => m.card.id === selected.id);
    return move?.position ?? null;
  });

  let evalMap = $derived.by(() => {
    const selected = $game.selectedCard;
    if (!selected) return null;
    const map = new Map<number, Outcome>();
    for (const move of $rankedMoves) {
      if (move.card.id === selected.id) {
        map.set(move.position, move.outcome);
      }
    }
    return map;
  });

  function getCellModifier(cell: BoardCellData, state: GameState | null, ruleset: RuleSet): number | null {
    if (!state || !cell || !typeAbbrev[cell.card.type]) return null;
    if (!ruleset.ascension && !ruleset.descension) return null;
    const count = boardTypeCount(state, cell.card.type);
    if (count === 0) return null;
    return ruleset.ascension ? count : -count;
  }
</script>

<div class="grid grid-cols-3 gap-2">
  {#each Array(9) as _, i}
    <BoardCell
      cell={$currentState?.board[i] ?? null}
      highlighted={suggestedPosition === i}
      evaluation={evalMap?.get(i) ?? null}
      modifier={getCellModifier($currentState?.board[i] ?? null, $currentState, $game.ruleset)}
      onclick={() => playCard(i)}
    />
  {/each}
</div>
