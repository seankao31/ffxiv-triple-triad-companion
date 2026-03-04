// ABOUTME: Minimax solver with alpha-beta pruning and transposition table.
// ABOUTME: Returns moves ranked by outcome (Win > Draw > Loss) from the current player's perspective.

import { type GameState, type RankedMove, type Card, Owner, Outcome } from "./types";
import { placeCard } from "./board";

// Assigns a unique integer to each card based on its values and type.
const TYPE_IDX: Record<string, number> = { none: 0, primal: 1, scion: 2, society: 3, garlean: 4 };

function cardId(c: Card): number {
  return c.top * 5000 + c.right * 500 + c.bottom * 50 + c.left * 5 + TYPE_IDX[c.type];
}

// Builds a mapping from cardId to a small index (1-10) for compact board hashing.
function buildCardIndex(state: GameState): Map<number, number> {
  const index = new Map<number, number>();
  let nextIdx = 1;
  for (const card of state.playerHand) {
    const id = cardId(card);
    if (!index.has(id)) index.set(id, nextIdx++);
  }
  for (const card of state.opponentHand) {
    const id = cardId(card);
    if (!index.has(id)) index.set(id, nextIdx++);
  }
  return index;
}

// Encodes board + turn as a single number for use as a Map key.
// Each cell: 0 = empty, 2*idx-1 = card idx owned by player, 2*idx = card idx owned by opponent.
// Packed into 5 bits per cell (9 cells) + 1 turn bit = 46 bits (safe integer).
function hashState(board: GameState["board"], currentTurn: Owner, cardIndex: Map<number, number>): number {
  let h = currentTurn === Owner.Player ? 0 : 1;
  let shift = 1;
  for (let i = 0; i < 9; i++) {
    const cell = board[i];
    if (cell) {
      const idx = cardIndex.get(cardId(cell.card))!;
      h += (cell.owner === Owner.Player ? idx * 2 - 1 : idx * 2) * shift;
    }
    shift *= 32;
  }
  return h;
}

// Returns true if all 9 board cells are occupied.
function boardFull(board: GameState["board"]): boolean {
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) return false;
  }
  return true;
}

// Evaluates terminal state score. Returns 1 for evaluatingFor wins, -1 for loss, 0 for draw.
function terminalValue(state: GameState, evaluatingFor: Owner): number {
  let player = state.playerHand.length;
  let opponent = state.opponentHand.length;
  for (let i = 0; i < 9; i++) {
    const cell = state.board[i];
    if (cell) {
      if (cell.owner === Owner.Player) player++;
      else opponent++;
    }
  }
  if (player > opponent) return evaluatingFor === Owner.Player ? 1 : -1;
  if (player < opponent) return evaluatingFor === Owner.Player ? -1 : 1;
  return 0;
}

// Returns 1 for win, 0 for draw, -1 for loss from evaluatingFor's perspective.
function minimax(
  state: GameState,
  evaluatingFor: Owner,
  alpha: number,
  beta: number,
  tt: Map<number, number>,
  cardIndex: Map<number, number>,
): number {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;

  // Terminal state: no cards to play or board is full
  if (hand.length === 0 || boardFull(state.board)) return terminalValue(state, evaluatingFor);

  const key = hashState(state.board, state.currentTurn, cardIndex);
  const cached = tt.get(key);
  if (cached !== undefined) return cached;

  const isMaximizing = state.currentTurn === evaluatingFor;
  let bestValue = isMaximizing ? -Infinity : Infinity;

  // Deduplicate identical cards to avoid redundant searches
  const seenCards = new Set<number>();

  outer:
  for (let ci = 0; ci < hand.length; ci++) {
    const card = hand[ci];
    const ck = cardId(card);
    if (seenCards.has(ck)) continue;
    seenCards.add(ck);

    for (let i = 0; i < 9; i++) {
      if (state.board[i] !== null) continue;

      const nextState = placeCard(state, card, i);
      const value = minimax(nextState, evaluatingFor, alpha, beta, tt, cardIndex);

      if (isMaximizing) {
        if (value > bestValue) bestValue = value;
        if (value > alpha) alpha = value;
      } else {
        if (value < bestValue) bestValue = value;
        if (value < beta) beta = value;
      }
      if (alpha >= beta) break outer;
    }
  }

  tt.set(key, bestValue);
  return bestValue;
}

export function findBestMove(state: GameState): RankedMove[] {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;

  if (hand.length === 0) return [];

  let hasEmpty = false;
  for (let i = 0; i < 9; i++) {
    if (state.board[i] === null) { hasEmpty = true; break; }
  }
  if (!hasEmpty) return [];

  const tt = new Map<number, number>();
  const cardIndex = buildCardIndex(state);

  // First pass: evaluate all moves with minimax
  const evaluated: { card: Card; position: number; value: number; nextState: GameState }[] = [];

  for (const card of hand) {
    for (let i = 0; i < 9; i++) {
      if (state.board[i] !== null) continue;

      const nextState = placeCard(state, card, i);
      const value = minimax(nextState, state.currentTurn, -Infinity, Infinity, tt, cardIndex);
      evaluated.push({ card, position: i, value, nextState });
    }
  }

  // Second pass: calculate robustness for tie-breaking.
  // For each move, count what fraction of opponent responses maintain the same outcome.
  const moves: RankedMove[] = evaluated.map(({ card, position, value, nextState }) => {
    const oppHand = nextState.currentTurn === Owner.Player ? nextState.playerHand : nextState.opponentHand;

    let totalResponses = 0;
    let sameOutcomeCount = 0;

    for (const oppCard of oppHand) {
      for (let i = 0; i < 9; i++) {
        if (nextState.board[i] !== null) continue;

        totalResponses++;
        const responseState = placeCard(nextState, oppCard, i);
        const responseValue = minimax(responseState, state.currentTurn, -Infinity, Infinity, tt, cardIndex);

        if (responseValue === value) sameOutcomeCount++;
      }
    }

    const outcome = value === 1 ? Outcome.Win : value === -1 ? Outcome.Loss : Outcome.Draw;
    const robustness = totalResponses > 0 ? sameOutcomeCount / totalResponses : 1;
    return { card, position, outcome, robustness };
  });

  // Sort: wins first, then draws, then losses; within same outcome, higher robustness first
  const outcomeOrder = { win: 0, draw: 1, loss: 2 };
  moves.sort((a, b) => {
    const orderDiff = outcomeOrder[a.outcome] - outcomeOrder[b.outcome];
    if (orderDiff !== 0) return orderDiff;
    return b.robustness - a.robustness;
  });

  return moves;
}
