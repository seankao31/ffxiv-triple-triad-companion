// ABOUTME: Game logic for card placement and capture resolution.
// ABOUTME: Handles standard capture, Plus, Same, and Combo cascades.

import type { Board, Card, GameState } from "./types";
import { Owner } from "./types";

export function placeCard(
  state: GameState,
  card: Card,
  position: number,
): GameState {
  if (position < 0 || position > 8) {
    throw new Error(`Invalid position: ${position}`);
  }
  if (state.board[position] !== null) {
    throw new Error(`Cell ${position} is already occupied`);
  }

  const hand =
    state.currentTurn === Owner.Player
      ? state.playerHand
      : state.opponentHand;
  const cardIndex = hand.indexOf(card);
  if (cardIndex === -1) {
    throw new Error("Card is not in the current player's hand");
  }

  const newBoard = [...state.board] as unknown as [
    ...Board,
  ];
  newBoard[position] = { card, owner: state.currentTurn };

  const newHand = [...hand.slice(0, cardIndex), ...hand.slice(cardIndex + 1)];

  const nextTurn =
    state.currentTurn === Owner.Player ? Owner.Opponent : Owner.Player;

  return {
    board: newBoard as Board,
    playerHand:
      state.currentTurn === Owner.Player ? newHand : state.playerHand,
    opponentHand:
      state.currentTurn === Owner.Opponent ? newHand : state.opponentHand,
    currentTurn: nextTurn,
  };
}
