// ABOUTME: Shared card display helpers for type labels and modifier calculation.
// ABOUTME: Used by BoardCell, HandPanel, and SolverPanel.
import { CardType, type GameState } from '../engine';

export const typeAbbrev: Partial<Record<CardType, string>> = {
  [CardType.Primal]: 'P',
  [CardType.Scion]: 'Sc',
  [CardType.Society]: 'So',
  [CardType.Garlean]: 'G',
};

export const typeColor: Partial<Record<CardType, string>> = {
  [CardType.Primal]: 'text-type-primal',
  [CardType.Scion]: 'text-type-scion',
  [CardType.Society]: 'text-type-society',
  [CardType.Garlean]: 'text-type-garlean',
};

export function boardTypeCount(state: GameState, type: CardType): number {
  let count = 0;
  for (const cell of state.board) {
    if (cell && cell.card.type === type) count++;
  }
  return count;
}
