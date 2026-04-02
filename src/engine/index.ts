// ABOUTME: Public API barrel export for the Triple Triad game logic.
// ABOUTME: Re-exports types, board logic, and PIMC sampling utilities.

export {
  type Card,
  type PlacedCard,
  type BoardCell,
  type Board,
  type GameState,
  type RuleSet,
  type RankedMove,
  type Neighbor,
  CardType,
  Owner,
  ADJACENCY,
  createCard,
  createInitialState,
  getScore,
  resetCardIds,
} from "./types";

export { placeCard } from "./board";
export { weightedSample, buildCandidatePool, type PIMCCard } from "./pimc";
