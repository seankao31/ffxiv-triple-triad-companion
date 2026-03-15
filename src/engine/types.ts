// ABOUTME: Core data types for the Triple Triad game engine.
// ABOUTME: Defines Card, BoardCell, GameState, and related enums.

export enum CardType {
  None = "none",
  Primal = "primal",
  Scion = "scion",
  Society = "society",
  Garlean = "garlean",
}

export enum Owner {
  Player = "player",
  Opponent = "opponent",
}

let _nextCardId = 0;
export function resetCardIds(): void { _nextCardId = 0; }

export interface Card {
  readonly id: number;
  readonly top: number; // 1-10, where 10 = A
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly type: CardType;
}

export interface PlacedCard {
  readonly card: Card;
  readonly owner: Owner;
}

export type BoardCell = PlacedCard | null;

// 3x3 board, row-major: [0,1,2] = top row, [3,4,5] = middle, [6,7,8] = bottom
export type Board = readonly [
  BoardCell,
  BoardCell,
  BoardCell,
  BoardCell,
  BoardCell,
  BoardCell,
  BoardCell,
  BoardCell,
  BoardCell,
];

export interface RuleSet {
  readonly plus: boolean;
  readonly same: boolean;
}

export interface GameState {
  readonly board: Board;
  readonly playerHand: readonly Card[];
  readonly opponentHand: readonly Card[];
  readonly currentTurn: Owner;
  readonly rules: RuleSet;
}

export enum Outcome {
  Win = "win",
  Draw = "draw",
  Loss = "loss",
}

export interface RankedMove {
  readonly card: Card;
  readonly position: number; // 0-8 board index
  readonly outcome: Outcome;
  readonly robustness: number; // fraction of opponent responses that lead to a strictly better outcome for us (opponent mistakes); 0 for wins since nothing beats a win
}

export interface Neighbor {
  readonly position: number;
  readonly attackingEdge: "top" | "right" | "bottom" | "left";
  readonly defendingEdge: "top" | "right" | "bottom" | "left";
}

export function createCard(
  top: number,
  right: number,
  bottom: number,
  left: number,
  type: CardType = CardType.None,
): Card {
  return { id: _nextCardId++, top, right, bottom, left, type };
}

export function createInitialState(
  playerHand: readonly Card[],
  opponentHand: readonly Card[],
  firstTurn: Owner = Owner.Player,
  rules: RuleSet = { plus: false, same: false },
): GameState {
  return {
    board: [null, null, null, null, null, null, null, null, null],
    playerHand,
    opponentHand,
    currentTurn: firstTurn,
    rules,
  };
}

export function getScore(state: GameState): {
  player: number;
  opponent: number;
} {
  let player = state.playerHand.length;
  let opponent = state.opponentHand.length;
  for (const cell of state.board) {
    if (cell) {
      if (cell.owner === Owner.Player) player++;
      else opponent++;
    }
  }
  return { player, opponent };
}

// Static lookup table mapping each board position (0-8) to its adjacent positions
// and the edges involved in combat between the attacking and defending cards.
export const ADJACENCY: readonly Neighbor[][] = [
  /* 0 */ [
    { position: 1, attackingEdge: "right", defendingEdge: "left" },
    { position: 3, attackingEdge: "bottom", defendingEdge: "top" },
  ],
  /* 1 */ [
    { position: 0, attackingEdge: "left", defendingEdge: "right" },
    { position: 2, attackingEdge: "right", defendingEdge: "left" },
    { position: 4, attackingEdge: "bottom", defendingEdge: "top" },
  ],
  /* 2 */ [
    { position: 1, attackingEdge: "left", defendingEdge: "right" },
    { position: 5, attackingEdge: "bottom", defendingEdge: "top" },
  ],
  /* 3 */ [
    { position: 0, attackingEdge: "top", defendingEdge: "bottom" },
    { position: 4, attackingEdge: "right", defendingEdge: "left" },
    { position: 6, attackingEdge: "bottom", defendingEdge: "top" },
  ],
  /* 4 */ [
    { position: 1, attackingEdge: "top", defendingEdge: "bottom" },
    { position: 3, attackingEdge: "left", defendingEdge: "right" },
    { position: 5, attackingEdge: "right", defendingEdge: "left" },
    { position: 7, attackingEdge: "bottom", defendingEdge: "top" },
  ],
  /* 5 */ [
    { position: 2, attackingEdge: "top", defendingEdge: "bottom" },
    { position: 4, attackingEdge: "left", defendingEdge: "right" },
    { position: 8, attackingEdge: "bottom", defendingEdge: "top" },
  ],
  /* 6 */ [
    { position: 3, attackingEdge: "top", defendingEdge: "bottom" },
    { position: 7, attackingEdge: "right", defendingEdge: "left" },
  ],
  /* 7 */ [
    { position: 6, attackingEdge: "left", defendingEdge: "right" },
    { position: 8, attackingEdge: "right", defendingEdge: "left" },
    { position: 4, attackingEdge: "top", defendingEdge: "bottom" },
  ],
  /* 8 */ [
    { position: 7, attackingEdge: "left", defendingEdge: "right" },
    { position: 5, attackingEdge: "top", defendingEdge: "bottom" },
  ],
];
