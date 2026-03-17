// ABOUTME: Web Worker entry point for the WASM-backed minimax solver.
// ABOUTME: Handles All Open solves and Three Open PIMC simulations via the Rust/WASM engine.
import init, { wasm_solve, wasm_simulate } from '../../engine-rs/pkg/engine_rs.js';
import {
  weightedSample, buildCandidatePool, computeStarBudgets, weightedSampleConstrained,
  type PIMCCard,
} from './pimc';
import { CardType, Owner, type Card, type GameState, type RankedMove } from './types';
import cardsJson from '../data/cards.json';

const allCards: PIMCCard[] = cardsJson as PIMCCard[];

type InMessage =
  | { type: 'newGame' }
  | { type: 'solve'; state: GameState; generation: number }
  | { type: 'simulate'; state: GameState; unknownCardIds: number[]; generation: number; simIndex: number };

type OutMessage =
  | { type: 'result'; moves: RankedMove[]; generation: number }
  | { type: 'sim-result'; move: RankedMove | null; generation: number; simIndex: number };

let initPromise: Promise<void> | null = null;

// Store the in-flight Promise so concurrent callers all await the same one.
async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => undefined);
  }
  await initPromise;
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  if (msg.type === 'newGame') {
    // No-op: wasm_solve/wasm_simulate create fresh TTs per call, no persistent state to reset.
    return;
  }

  if (msg.type === 'solve') {
    await ensureInit();
    const resultJson = wasm_solve(JSON.stringify(msg.state));
    const moves: RankedMove[] = JSON.parse(resultJson);
    self.postMessage({ type: 'result', moves, generation: msg.generation } satisfies OutMessage);
    return;
  }

  if (msg.type === 'simulate') {
    await ensureInit();
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
      // Degenerate case: no unknowns or not enough candidates.
      const movesJson = wasm_solve(JSON.stringify(state));
      const moves: RankedMove[] = JSON.parse(movesJson);
      self.postMessage({
        type: 'sim-result', move: moves[0] ?? null, generation, simIndex,
      } satisfies OutMessage);
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
    const topMoveJson = wasm_simulate(JSON.stringify(simState));
    const topMove: RankedMove | null = JSON.parse(topMoveJson);

    if (!topMove) {
      self.postMessage({ type: 'sim-result', move: null, generation, simIndex } satisfies OutMessage);
      return;
    }

    // Return the move referencing the original-state card (same ID, original stats).
    const currentHand = state.currentTurn === Owner.Player
      ? (state.playerHand as Card[])
      : (state.opponentHand as Card[]);
    const originalCard = currentHand.find((c) => c.id === topMove.card.id) ?? topMove.card;
    self.postMessage({
      type: 'sim-result', move: { ...topMove, card: originalCard }, generation, simIndex,
    } satisfies OutMessage);
  }
};
