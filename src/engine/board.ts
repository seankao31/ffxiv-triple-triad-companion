// ABOUTME: Game logic for card placement and capture resolution.
// ABOUTME: Handles standard capture, Plus, Same, and Combo cascades.

import type { Board, Card, GameState, Neighbor } from "./types";
import { ADJACENCY, Owner } from "./types";

// Returns positions of opponent cards flipped by the Plus rule.
// Plus triggers when 2+ adjacent pairs share the same sum of touching values.
function resolvePlus(
  board: [...Board],
  card: Card,
  position: number,
  currentTurn: Owner,
): number[] {
  const sums: { neighbor: Neighbor; sum: number }[] = [];

  for (const neighbor of ADJACENCY[position]) {
    const neighborCell = board[neighbor.position];
    if (!neighborCell) continue;
    const sum = card[neighbor.attackingEdge] + neighborCell.card[neighbor.defendingEdge];
    sums.push({ neighbor, sum });
  }

  // Group by sum value, collect neighbors in groups of 2+
  const groups = new Map<number, Neighbor[]>();
  for (const { neighbor, sum } of sums) {
    let group = groups.get(sum);
    if (!group) {
      group = [];
      groups.set(sum, group);
    }
    group.push(neighbor);
  }

  const flipped: number[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const neighbor of group) {
      const neighborCell = board[neighbor.position]!;
      if (neighborCell.owner !== currentTurn) {
        board[neighbor.position] = { card: neighborCell.card, owner: currentTurn };
        flipped.push(neighbor.position);
      }
    }
  }
  return flipped;
}

// Returns positions of opponent cards flipped by the Same rule.
function resolveSame(
  board: [...Board],
  card: Card,
  position: number,
  currentTurn: Owner,
): number[] {
  const samePairs: Neighbor[] = [];

  for (const neighbor of ADJACENCY[position]) {
    const neighborCell = board[neighbor.position];
    if (!neighborCell) continue;
    if (card[neighbor.attackingEdge] === neighborCell.card[neighbor.defendingEdge]) {
      samePairs.push(neighbor);
    }
  }

  if (samePairs.length < 2) return [];

  const flipped: number[] = [];
  for (const neighbor of samePairs) {
    const neighborCell = board[neighbor.position]!;
    if (neighborCell.owner !== currentTurn) {
      board[neighbor.position] = { card: neighborCell.card, owner: currentTurn };
      flipped.push(neighbor.position);
    }
  }
  return flipped;
}

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

  // Plus rule: flip opponent cards in adjacent pairs that share the same sum
  resolvePlus(newBoard, card, position, state.currentTurn);

  // Same rule: flip opponent cards that form 2+ equal-value pairs
  resolveSame(newBoard, card, position, state.currentTurn);

  // Standard capture: flip adjacent opponent cards with strictly lower values
  for (const neighbor of ADJACENCY[position]) {
    const neighborCell = newBoard[neighbor.position];
    if (neighborCell && neighborCell.owner !== state.currentTurn) {
      if (card[neighbor.attackingEdge] > neighborCell.card[neighbor.defendingEdge]) {
        newBoard[neighbor.position] = { card: neighborCell.card, owner: state.currentTurn };
      }
    }
  }

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
