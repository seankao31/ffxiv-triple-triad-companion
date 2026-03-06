// ABOUTME: Web Worker entry point for the minimax solver.
// ABOUTME: Maintains a persistent solver instance across turns of a single game.
import { createSolver } from './solver';
import type { GameState, Card, RankedMove } from './types';

type InMessage =
  | { type: 'newGame'; playerHand: Card[]; opponentHand: Card[] }
  | { type: 'solve'; state: GameState };

type OutMessage =
  | { type: 'result'; moves: RankedMove[] };

const solver = createSolver();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'newGame') {
    solver.reset(msg.playerHand, msg.opponentHand);
  } else if (msg.type === 'solve') {
    const moves = solver.solve(msg.state);
    self.postMessage({ type: 'result', moves } satisfies OutMessage);
  }
};
