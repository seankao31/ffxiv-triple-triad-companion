// ABOUTME: Web Worker entry point for the minimax solver.
// ABOUTME: Maintains a persistent solver instance across turns of a single game.
import { createSolver } from './solver';
import { weightedSample, buildCandidatePool, computeStarBudgets, weightedSampleConstrained, type PIMCCard } from './pimc';
import { CardType, Owner, type Card, type GameState, type RankedMove } from './types';
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

// Persistent solver — its TT is reused and bounded across turns and simulations.
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
    const unknownCount = unknownCardIds.size;

    if (unknownCount === 0 || pool.length < unknownCount) {
      // Degenerate case: no unknowns or not enough candidates to sample.
      solver.reset();
      const moves = solver.solve(state);
      self.postMessage({ type: 'sim-result', move: moves[0] ?? null, generation, simIndex } satisfies OutMessage);
      return;
    }

    // Compute star budget from known (non-unknown) opponent cards.
    const knownOpponentCards = (state.opponentHand as Card[]).filter((c) => !unknownCardIds.has(c.id));
    const { maxFiveStars, maxFourStars } = computeStarBudgets(knownOpponentCards, allCards);

    // Sample unknown cards respecting star budget; fall back to unconstrained if constraints can't be met.
    const sampled = weightedSampleConstrained(pool, unknownCount, maxFiveStars, maxFourStars)
      ?? weightedSample(pool, unknownCount);
    const unknownToSampled = new Map<number, PIMCCard>();
    let si = 0;
    for (const uid of unknownCardIds) unknownToSampled.set(uid, sampled[si++]!);

    const opponentHand: Card[] = (state.opponentHand as Card[]).map((c) => {
      const s = unknownToSampled.get(c.id);
      if (!s) return c;
      return { id: c.id, top: s.top, right: s.right, bottom: s.bottom, left: s.left, type: (s.type as CardType) ?? CardType.None };
    });

    const simState: GameState = { ...state, opponentHand };

    // Reset the persistent solver's TT for a clean solve on this sampled world.
    // This avoids allocating a new solver (and TT) per simulation, keeping memory bounded.
    solver.reset();
    const moves = solver.solve(simState);
    if (moves.length === 0) {
      self.postMessage({ type: 'sim-result', move: null, generation, simIndex } satisfies OutMessage);
      return;
    }

    const top = moves[0]!;
    // Return the move referencing the original-state card (same ID, original stats).
    const currentHand = state.currentTurn === Owner.Player
      ? (state.playerHand as Card[])
      : (state.opponentHand as Card[]);
    const originalCard = currentHand.find((c) => c.id === top.card.id) ?? top.card;
    self.postMessage({ type: 'sim-result', move: { ...top, card: originalCard }, generation, simIndex } satisfies OutMessage);
  }
};
