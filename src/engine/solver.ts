// ABOUTME: Minimax solver that evaluates all possible moves in a game tree.
// ABOUTME: Returns moves ranked by outcome (Win > Draw > Loss) from the current player's perspective.

import { type GameState, type RankedMove, type Card, Owner, Outcome, getScore } from "./types";
import { placeCard } from "./board";

// Returns 1 for win, 0 for draw, -1 for loss from evaluatingFor's perspective.
function minimax(state: GameState, evaluatingFor: Owner): number {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;
  const emptyPositions: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (state.board[i] === null) emptyPositions.push(i);
  }

  // Terminal state: no cards to play or no empty positions
  if (hand.length === 0 || emptyPositions.length === 0) {
    const score = getScore(state);
    if (score.player > score.opponent) return evaluatingFor === Owner.Player ? 1 : -1;
    if (score.player < score.opponent) return evaluatingFor === Owner.Player ? -1 : 1;
    return 0;
  }

  const isMaximizing = state.currentTurn === evaluatingFor;
  let bestValue = isMaximizing ? -Infinity : Infinity;

  // Deduplicate identical cards to avoid redundant searches
  const seenCards = new Set<string>();

  for (const card of hand) {
    const cardKey = `${card.top},${card.right},${card.bottom},${card.left},${card.type}`;
    if (seenCards.has(cardKey)) continue;
    seenCards.add(cardKey);

    for (const position of emptyPositions) {
      const nextState = placeCard(state, card, position);
      const value = minimax(nextState, evaluatingFor);

      if (isMaximizing) {
        bestValue = Math.max(bestValue, value);
        if (bestValue === 1) return 1;
      } else {
        bestValue = Math.min(bestValue, value);
        if (bestValue === -1) return -1;
      }
    }
  }

  return bestValue;
}

export function findBestMove(state: GameState): RankedMove[] {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;
  const emptyPositions: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (state.board[i] === null) emptyPositions.push(i);
  }

  if (hand.length === 0 || emptyPositions.length === 0) return [];

  const moves: RankedMove[] = [];

  for (const card of hand) {
    for (const position of emptyPositions) {
      const nextState = placeCard(state, card, position);
      const value = minimax(nextState, state.currentTurn);

      const outcome = value === 1 ? Outcome.Win : value === -1 ? Outcome.Loss : Outcome.Draw;
      moves.push({ card, position, outcome, robustness: 0 });
    }
  }

  // Sort: wins first, then draws, then losses
  const outcomeOrder = { win: 0, draw: 1, loss: 2 };
  moves.sort((a, b) => outcomeOrder[a.outcome] - outcomeOrder[b.outcome]);

  return moves;
}
