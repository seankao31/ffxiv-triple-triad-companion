// ABOUTME: Game logic for card placement and capture resolution.
// ABOUTME: Handles standard capture, Plus, Same, and Combo cascades.

import type { Board, Card, GameState, Neighbor, RuleSet } from "./types";
import { ADJACENCY, CardType, Owner } from "./types";

// Applies Ascension/Descension stat modifiers to an edge value.
// Ascension: boosts a card's edge values by the count of same-type cards already on board (capped at 10).
// Descension: reduces a card's edge values by the count of same-type cards already on board (floored at 1).
// typeCounts is snapshotted before placement so the placed card never counts toward its own modifier.
function applyStatMod(value: number, cardType: CardType, rules: RuleSet, typeCounts: Map<CardType, number>): number {
  const count = typeCounts.get(cardType) ?? 0;
  if (rules.ascension) return Math.min(10, value + count);
  if (rules.descension) return Math.max(1, value - count);
  return value;
}

// Returns true if the attacker's edge value captures the defender's edge value under the active rules.
// Fallen Ace makes the "weakest" value also capture the "strongest":
//   Without Reverse: 1 (weakest) also captures 10; 10 still captures 1 via basic rule.
//   With Reverse:    10 (weakest) also captures 1; 1 still captures 10 via Reverse rule.
function captures(attackerValue: number, defenderValue: number, rules: RuleSet): boolean {
  if (rules.fallenAce) {
    if (!rules.reverse && attackerValue === 1 && defenderValue === 10) return true;
    if (rules.reverse && attackerValue === 10 && defenderValue === 1) return true;
  }
  return rules.reverse ? attackerValue < defenderValue : attackerValue > defenderValue;
}

// Returns positions of opponent cards flipped by the Plus rule.
// Plus triggers when 2+ adjacent pairs share the same sum of touching values.
function resolvePlus(
  board: [...Board],
  card: Card,
  position: number,
  currentTurn: Owner,
  rules: RuleSet,
  typeCounts: Map<CardType, number>,
): number[] {
  const sums: { neighbor: Neighbor; sum: number }[] = [];

  for (const neighbor of ADJACENCY[position]!) {
    const neighborCell = board[neighbor.position];
    if (!neighborCell) continue;
    const attackVal = applyStatMod(card[neighbor.attackingEdge], card.type, rules, typeCounts);
    const defendVal = applyStatMod(neighborCell.card[neighbor.defendingEdge], neighborCell.card.type, rules, typeCounts);
    const sum = attackVal + defendVal;
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
  rules: RuleSet,
  typeCounts: Map<CardType, number>,
): number[] {
  const samePairs: Neighbor[] = [];

  for (const neighbor of ADJACENCY[position]!) {
    const neighborCell = board[neighbor.position];
    if (!neighborCell) continue;
    const attackVal = applyStatMod(card[neighbor.attackingEdge], card.type, rules, typeCounts);
    const defendVal = applyStatMod(neighborCell.card[neighbor.defendingEdge], neighborCell.card.type, rules, typeCounts);
    if (attackVal === defendVal) {
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

// BFS over positions flipped by Plus/Same, doing standard captures from each.
// Newly flipped cards are added to the queue. Does NOT re-trigger Plus or Same.
function resolveCombo(
  board: [...Board],
  currentTurn: Owner,
  initialFlips: number[],
  rules: RuleSet,
  typeCounts: Map<CardType, number>,
): void {
  const queue = [...initialFlips];
  const processed = new Set<number>();

  while (queue.length > 0) {
    const pos = queue.shift()!;
    if (processed.has(pos)) continue;
    processed.add(pos);

    const cell = board[pos]!;
    for (const neighbor of ADJACENCY[pos]!) {
      const neighborCell = board[neighbor.position];
      if (neighborCell && neighborCell.owner !== currentTurn) {
        const attackVal = applyStatMod(cell.card[neighbor.attackingEdge], cell.card.type, rules, typeCounts);
        const defendVal = applyStatMod(neighborCell.card[neighbor.defendingEdge], neighborCell.card.type, rules, typeCounts);
        if (captures(attackVal, defendVal, rules)) {
          board[neighbor.position] = { card: neighborCell.card, owner: currentTurn };
          queue.push(neighbor.position);
        }
      }
    }
  }
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

  // Snapshot per-type card counts from board BEFORE placing (i++ timing: placed card excluded).
  const typeCounts = new Map<CardType, number>();
  for (const cell of state.board) {
    if (!cell) continue;
    const t = cell.card.type;
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }

  const newBoard = [...state.board] as unknown as [
    ...Board,
  ];
  newBoard[position] = { card, owner: state.currentTurn };

  // Plus rule: flip opponent cards in adjacent pairs that share the same sum
  const plusFlips = state.rules.plus ? resolvePlus(newBoard, card, position, state.currentTurn, state.rules, typeCounts) : [];

  // Same rule: flip opponent cards that form 2+ equal-value pairs
  const sameFlips = state.rules.same ? resolveSame(newBoard, card, position, state.currentTurn, state.rules, typeCounts) : [];

  // Combo cascade: BFS standard captures from all Plus/Same flipped positions
  resolveCombo(newBoard, state.currentTurn, [...plusFlips, ...sameFlips], state.rules, typeCounts);

  // Standard capture: flip adjacent opponent cards per active capture rules
  for (const neighbor of ADJACENCY[position]!) {
    const neighborCell = newBoard[neighbor.position];
    if (neighborCell && neighborCell.owner !== state.currentTurn) {
      const attackVal = applyStatMod(card[neighbor.attackingEdge], card.type, state.rules, typeCounts);
      const defendVal = applyStatMod(neighborCell.card[neighbor.defendingEdge], neighborCell.card.type, state.rules, typeCounts);
      if (captures(attackVal, defendVal, state.rules)) {
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
    rules: state.rules,
  };
}
