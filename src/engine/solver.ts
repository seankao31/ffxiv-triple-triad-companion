// ABOUTME: Minimax solver with alpha-beta pruning and transposition table.
// ABOUTME: Returns moves ranked by outcome (Win > Draw > Loss) from the current player's perspective.

import { type GameState, type RankedMove, type Card, Owner, Outcome } from "./types";
import { placeCard } from "./board";

// Assigns a unique integer to each card based on its values and type for within-hand deduplication.
const TYPE_IDX: Record<string, number> = { none: 0, primal: 1, scion: 2, society: 3, garlean: 4 };

function statsKey(c: Card): number {
  return c.top * 5000 + c.right * 500 + c.bottom * 50 + c.left * 5 + TYPE_IDX[c.type]!;
}

// Encodes board + turn as a single number for use as a Map key.
// Each cell: 0 = empty, 2*idx-1 = card idx owned by player, 2*idx = card idx owned by opponent.
// Turn bit occupies bit 0 (0=player, 1=opponent). Cells packed starting at bit 1 (shift=2),
// 5 bits each (max cell value 20 < 32). Total: 1 + 9*5 = 46 bits (safe integer).
function hashState(board: GameState["board"], currentTurn: Owner): number {
  let h = currentTurn === Owner.Player ? 0 : 1;
  let shift = 2;
  for (let i = 0; i < 9; i++) {
    const cell = board[i];
    if (cell) {
      const idx = cell.card.id + 1;
      h += (cell.owner === Owner.Player ? idx * 2 - 1 : idx * 2) * shift;
    }
    shift *= 32;
  }
  return h;
}

function boardFull(board: GameState["board"]): boolean {
  return board.every(cell => cell !== null);
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

const enum TTFlag {
  Exact = 0,
  LowerBound = 1,
  UpperBound = 2,
}

interface TTEntry {
  readonly value: number;
  readonly flag: TTFlag;
}

// Returns 1 for win, 0 for draw, -1 for loss from evaluatingFor's perspective.
function minimax(
  state: GameState,
  evaluatingFor: Owner,
  alpha: number,
  beta: number,
  tt: Map<number, TTEntry>,
): number {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;

  // Terminal state: no cards to play or board is full
  if (hand.length === 0 || boardFull(state.board)) return terminalValue(state, evaluatingFor);

  const key = hashState(state.board, state.currentTurn);
  const cached = tt.get(key);
  if (cached !== undefined) {
    if (cached.flag === TTFlag.Exact) return cached.value;
    if (cached.flag === TTFlag.LowerBound) {
      if (cached.value >= beta) return cached.value;
      alpha = Math.max(alpha, cached.value);
    }
    if (cached.flag === TTFlag.UpperBound) {
      if (cached.value <= alpha) return cached.value;
      beta = Math.min(beta, cached.value);
    }
    if (alpha >= beta) return cached.value;
  }

  const isMaximizing = state.currentTurn === evaluatingFor;
  const origAlpha = alpha;
  const origBeta = beta;
  let bestValue = isMaximizing ? -Infinity : Infinity;

  // Deduplicate identical cards to avoid redundant searches
  const seenCards = new Set<number>();

  outer:
  for (let ci = 0; ci < hand.length; ci++) {
    const card = hand[ci]!;
    const ck = statsKey(card);
    if (seenCards.has(ck)) continue;
    seenCards.add(ck);

    for (let i = 0; i < 9; i++) {
      if (state.board[i] !== null) continue;

      const nextState = placeCard(state, card, i);
      const value = minimax(nextState, evaluatingFor, alpha, beta, tt);

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

  // Determine bound type based on whether pruning narrowed the window
  let flag: TTFlag;
  if (isMaximizing) {
    flag = bestValue <= origAlpha ? TTFlag.UpperBound
         : bestValue >= beta ? TTFlag.LowerBound
         : TTFlag.Exact;
  } else {
    flag = bestValue >= origBeta ? TTFlag.LowerBound
         : bestValue <= alpha ? TTFlag.UpperBound
         : TTFlag.Exact;
  }
  tt.set(key, { value: bestValue, flag });

  return bestValue;
}

function findBestMoveWith(state: GameState, tt: Map<number, TTEntry>): RankedMove[] {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;

  if (hand.length === 0) return [];

  if (boardFull(state.board)) return [];

  // All minimax calls use Owner.Player as evaluatingFor so TT values are always from
  // Player's perspective. This makes TT entries safe to reuse across turns even when
  // the persistent solver is in use (currentTurn flips each turn, but the stored values
  // never change meaning).
  const currentIsPlayer = state.currentTurn === Owner.Player;

  // First pass: evaluate all moves with minimax
  const evaluated: { card: Card; position: number; value: number; nextState: GameState }[] = [];
  const seenCards = new Set<number>();

  for (const card of hand) {
    const ck = statsKey(card);
    if (seenCards.has(ck)) continue;
    seenCards.add(ck);

    for (let i = 0; i < 9; i++) {
      if (state.board[i] !== null) continue;

      const nextState = placeCard(state, card, i);
      const value = minimax(nextState, Owner.Player, -Infinity, Infinity, tt);
      evaluated.push({ card, position: i, value, nextState });
    }
  }

  // Second pass: calculate robustness for tie-breaking.
  // For each move, count what fraction of opponent responses maintain the same outcome.
  const moves: RankedMove[] = evaluated.map(({ card, position, value, nextState }) => {
    const oppHand = nextState.currentTurn === Owner.Player ? nextState.playerHand : nextState.opponentHand;

    let totalResponses = 0;
    let betterOutcomeCount = 0;

    for (const oppCard of oppHand) {
      for (let i = 0; i < 9; i++) {
        if (nextState.board[i] !== null) continue;

        totalResponses++;
        const responseState = placeCard(nextState, oppCard, i);
        const responseValue = minimax(responseState, Owner.Player, -Infinity, Infinity, tt);

        // "Better" means: better for the current player (state.currentTurn).
        // Values are from Player's perspective: higher = better for Player.
        if (currentIsPlayer ? responseValue > value : responseValue < value) betterOutcomeCount++;
      }
    }

    // value is from Player's perspective; flip sign when it's Opponent's turn.
    const effectiveValue = currentIsPlayer ? value : -value;
    const outcome = effectiveValue === 1 ? Outcome.Win : effectiveValue === -1 ? Outcome.Loss : Outcome.Draw;
    const robustness = totalResponses > 0 ? betterOutcomeCount / totalResponses : 0;
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

export function findBestMove(state: GameState): RankedMove[] {
  const tt = new Map<number, TTEntry>();
  return findBestMoveWith(state, tt);
}

export interface Solver {
  reset(): void;
  solve(state: GameState): RankedMove[];
  ttSize(): number;
  hashFor(state: GameState): number;
}

export function createSolver(): Solver {
  let tt = new Map<number, TTEntry>();

  return {
    reset() {
      tt = new Map();
    },
    solve(state: GameState): RankedMove[] {
      return findBestMoveWith(state, tt);
    },
    ttSize(): number {
      return tt.size;
    },
    hashFor(state: GameState): number {
      return hashState(state.board, state.currentTurn);
    },
  };
}
