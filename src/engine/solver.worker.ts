// ABOUTME: Web Worker entry point for the minimax solver.
// ABOUTME: Maintains a persistent solver instance across turns of a single game.
import { createSolver } from './solver';
import { runPIMC, buildCandidatePool, type PIMCCard } from './pimc';
import type { GameState, RankedMove } from './types';
import cardsJson from '../data/cards.json';

// Precompute the full card pool from cards.json once at Worker load time.
const allCards: PIMCCard[] = cardsJson as PIMCCard[];

type InMessage =
  | { type: 'newGame' }
  | { type: 'solve'; state: GameState; generation: number }
  | { type: 'simulate'; state: GameState; unknownCardIds: number[]; generation: number; simIndex: number };

type OutMessage =
  | { type: 'result'; moves: RankedMove[]; generation: number }
  | { type: 'sim-result'; move: RankedMove | null; generation: number; simIndex: number };

const solver = createSolver();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'newGame') {
    solver.reset();
  } else if (msg.type === 'solve') {
    const moves = solver.solve(msg.state);
    self.postMessage({ type: 'result', moves, generation: msg.generation } satisfies OutMessage);
  } else if (msg.type === 'simulate') {
    const { state, unknownCardIds: unknownArr, generation, simIndex } = msg;
    const unknownCardIds = new Set(unknownArr);

    // Build known-card ID set: board + known hands
    const knownIds = new Set<number>();
    for (const cell of state.board) {
      if (cell) knownIds.add(cell.card.id);
    }
    for (const c of state.playerHand) knownIds.add(c.id);
    for (const c of state.opponentHand) {
      if (!unknownCardIds.has(c.id)) knownIds.add(c.id);
    }

    const pool = buildCandidatePool(allCards, knownIds);
    // Run a single PIMC simulation.
    const results = runPIMC(state, unknownCardIds, pool, 1);
    const move = results[0] ?? null;
    self.postMessage({ type: 'sim-result', move, generation, simIndex } satisfies OutMessage);
  }
};
