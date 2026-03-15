// ABOUTME: Web Worker entry point for the minimax solver.
// ABOUTME: Maintains a persistent solver instance across turns of a single game.
import { createSolver } from './solver';
import type { GameState, RankedMove } from './types';

type InMessage =
  | { type: 'newGame' }
  | { type: 'solve'; state: GameState };

type OutMessage =
  | { type: 'result'; moves: RankedMove[] };

const solver = createSolver();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'newGame') {
    solver.reset();
  } else if (msg.type === 'solve') {
    const moves = solver.solve(msg.state);
    self.postMessage({ type: 'result', moves } satisfies OutMessage);
  }
};
