// ABOUTME: Shared card display helpers for type labels and modifier calculation.
// ABOUTME: Used by CardFace, HandPanel, and SolverPanel.
import { CardType, Owner, type GameState, type RuleSet } from '../engine';

export type PlayerSide = 'left' | 'right';
export type SideColor = 'blue' | 'red';

export function ownerColor(owner: Owner, playerSide: PlayerSide): SideColor {
  const playerIsBlue = playerSide === 'left';
  if (owner === Owner.Player) return playerIsBlue ? 'blue' : 'red';
  return playerIsBlue ? 'red' : 'blue';
}

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

export function cardModifier(
  cardType: CardType, state: GameState | null, ruleset: RuleSet
): number | null {
  if (!state || !typeAbbrev[cardType]) return null;
  if (!ruleset.ascension && !ruleset.descension) return null;
  const count = boardTypeCount(state, cardType);
  if (count === 0) return null;
  return ruleset.ascension ? count : -count;
}
