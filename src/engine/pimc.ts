// ABOUTME: Perfect Information Monte Carlo (PIMC) solver for Three Open games.
// ABOUTME: Samples unknown opponent cards from a weighted pool, runs minimax per simulation, aggregates confidence.

import { type GameState, type RankedMove, type Card, CardType, Owner } from './types';
import { findBestMove } from './solver';

export interface PIMCCard {
  readonly id?: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly type: string;
  readonly owned: number;
  readonly stars: number;
}

// Precompute weight for a candidate card: owned × (maxStat + secondMaxStat).
// This naturally separates rarity tiers while rewarding offensive power.
function cardWeight(c: PIMCCard): number {
  const stats = [c.top, c.right, c.bottom, c.left].sort((a, b) => b - a);
  return c.owned * (stats[0]! + stats[1]!);
}

// Sample `count` items without replacement using weighted reservoir sampling.
export function weightedSample(pool: PIMCCard[], count: number): PIMCCard[] {
  if (count > pool.length) throw new Error(`Cannot sample ${count} from pool of ${pool.length}`);
  // Weighted reservoir sampling (Efraimidis–Spirakis)
  const reservoir = pool
    .map((item) => ({ item, key: Math.random() ** (1 / (cardWeight(item) || 1e-9)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((x) => x.item);
  return reservoir;
}

// Build the candidate pool by excluding known card IDs and unowned cards.
export function buildCandidatePool(all: PIMCCard[], knownIds: Set<number>): PIMCCard[] {
  return all.filter((c) => c.owned > 0 && (c.id === undefined || !knownIds.has(c.id)));
}

// Run PIMC: for each simulation, replace placeholder cards with sampled candidates,
// run minimax, record the top move. Aggregate confidence = fraction of simulations
// where each (card, position) was the top move.
export function runPIMC(
  state: GameState,
  unknownCardIds: Set<number>,
  pool: PIMCCard[],
  iterations: number,
): RankedMove[] {
  const unknownCount = unknownCardIds.size;
  if (unknownCount === 0 || pool.length < unknownCount) return findBestMove(state);

  // Count top-move tallies by (card.id, position) key.
  const tally = new Map<string, { move: RankedMove; count: number }>();

  for (let sim = 0; sim < iterations; sim++) {
    const sampled = weightedSample(pool, unknownCount);

    // Replace placeholder cards in opponentHand with sampled cards (same ID, real stats).
    // Build an index from unknownCardId → sampled card for O(1) lookup per slot.
    const unknownToSampled = new Map<number, PIMCCard>();
    let si = 0;
    for (const uid of unknownCardIds) unknownToSampled.set(uid, sampled[si++]!);

    const opponentHand: Card[] = (state.opponentHand as Card[]).map((c) => {
      const sampledCard = unknownToSampled.get(c.id);
      if (!sampledCard) return c;
      return {
        id: c.id,
        top: sampledCard.top,
        right: sampledCard.right,
        bottom: sampledCard.bottom,
        left: sampledCard.left,
        type: (sampledCard.type as CardType) ?? CardType.None,
      };
    });

    const simState: GameState = { ...state, opponentHand };
    const moves = findBestMove(simState);
    if (moves.length === 0) continue;

    const top = moves[0]!;
    // Use the original state's card (same ID) so the tally key refers to the real-state card.
    const currentHand = state.currentTurn === Owner.Player
      ? (state.playerHand as Card[])
      : (state.opponentHand as Card[]);
    const originalCard = currentHand.find((c) => c.id === top.card.id) ?? top.card;

    const key = `${originalCard.id}:${top.position}`;
    const existing = tally.get(key);
    if (existing) {
      existing.count++;
    } else {
      tally.set(key, { move: { ...top, card: originalCard }, count: 1 });
    }
  }

  const results: RankedMove[] = Array.from(tally.values()).map(({ move, count }) => ({
    ...move,
    confidence: count / iterations,
  }));

  results.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  return results;
}

