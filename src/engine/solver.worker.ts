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
  | { type: 'pimc'; state: GameState; unknownCardIds: number[]; generation: number; iterations?: number };

type OutMessage =
  | { type: 'result'; moves: RankedMove[]; generation: number }
  | { type: 'pimc-progress'; current: number; total: number; generation: number };

const PIMC_ITERATIONS = 50;

const solver = createSolver();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'newGame') {
    solver.reset();
  } else if (msg.type === 'solve') {
    const moves = solver.solve(msg.state);
    self.postMessage({ type: 'result', moves, generation: msg.generation } satisfies OutMessage);
  } else if (msg.type === 'pimc') {
    const { state, unknownCardIds: unknownArr, generation, iterations = PIMC_ITERATIONS } = msg;
    const unknownCardIds = new Set(unknownArr);

    // Build known-card ID set: all cards on board + in known hands
    const knownIds = new Set<number>();
    for (const cell of state.board) {
      if (cell) knownIds.add(cell.card.id);
    }
    for (const c of state.playerHand) knownIds.add(c.id);
    for (const c of state.opponentHand) {
      if (!unknownCardIds.has(c.id)) knownIds.add(c.id);
    }

    const pool = buildCandidatePool(allCards, knownIds);

    // Post incremental progress every 10 simulations
    const progressInterval = 10;
    let simsDone = 0;
    const moves: RankedMove[] = [];

    // Run in batches to emit progress; each batch calls runPIMC for partial iterations
    const batchSize = progressInterval;
    const batches = Math.ceil(iterations / batchSize);
    // Aggregate tally across all batches
    const tally = new Map<string, { move: RankedMove; count: number }>();

    for (let b = 0; b < batches; b++) {
      const batchIterations = Math.min(batchSize, iterations - simsDone);
      const batchMoves = runPIMC(state, unknownCardIds, pool, batchIterations);

      for (const m of batchMoves) {
        const key = `${m.card.id}:${m.position}`;
        const existing = tally.get(key);
        if (existing) {
          existing.count += Math.round((m.confidence ?? 0) * batchIterations);
        } else {
          tally.set(key, { move: m, count: Math.round((m.confidence ?? 0) * batchIterations) });
        }
      }

      simsDone += batchIterations;
      self.postMessage({
        type: 'pimc-progress',
        current: simsDone,
        total: iterations,
        generation,
      } satisfies OutMessage);
    }

    // Compute final confidence from aggregated tally
    const results: RankedMove[] = Array.from(tally.values()).map(({ move, count }) => ({
      ...move,
      confidence: count / iterations,
    }));
    results.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

    self.postMessage({ type: 'result', moves: results, generation } satisfies OutMessage);
  }
};
