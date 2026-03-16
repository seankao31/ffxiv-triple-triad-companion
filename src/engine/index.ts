// ABOUTME: Public API barrel export for the Triple Triad engine.
// ABOUTME: Re-exports types, board logic, and solver functions.

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
  Outcome,
  ADJACENCY,
  createCard,
  createInitialState,
  getScore,
  resetCardIds,
} from "./types";

export { placeCard } from "./board";
export { findBestMove } from "./solver";
export { weightedSample, buildCandidatePool, runPIMC, type PIMCCard } from "./pimc";
