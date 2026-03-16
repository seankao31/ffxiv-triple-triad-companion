// ABOUTME: Web Worker entry point for the minimax solver.
// ABOUTME: Maintains a persistent solver instance across turns of a single game.
import { createSolver } from './solver';
import type { GameState, RankedMove } from './types';

type InMessage =
  | { type: 'newGame' }
  | { type: 'solve'; state: GameState; generation: number };

type OutMessage =
  | { type: 'result'; moves: RankedMove[]; generation: number };

const solver = createSolver();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'newGame') {
    solver.reset();
  } else if (msg.type === 'solve') {
    const moves = solver.solve(msg.state);
    self.postMessage({ type: 'result', moves, generation: msg.generation } satisfies OutMessage);
  }
};
