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

// FFXIV deck star limits: at most 1 five-star; at most 2 four-stars (or 1 if deck has a five-star).
// Returns remaining budget for unknown slots based on already-revealed opponent cards.
// Cards not found in allCards by stats are treated as below four-star (no budget consumed).
export function computeStarBudgets(
  knownOpponentCards: Card[],
  allCards: PIMCCard[],
): { maxFiveStars: number; maxFourStars: number } {
  let fiveStarsSeen = 0;
  let fourStarsSeen = 0;
  for (const card of knownOpponentCards) {
    const stars = lookupStars(card, allCards);
    if (stars === 5) fiveStarsSeen++;
    else if (stars === 4) fourStarsSeen++;
  }
  return {
    maxFiveStars: Math.max(0, 1 - fiveStarsSeen),
    maxFourStars: Math.max(0, (fiveStarsSeen > 0 ? 1 : 2) - fourStarsSeen),
  };
}

// Returns the highest star count among allCards that match card's stats; 0 if no match.
function lookupStars(card: Card, allCards: PIMCCard[]): number {
  let maxStars = 0;
  for (const pc of allCards) {
    if (pc.top === card.top && pc.right === card.right && pc.bottom === card.bottom && pc.left === card.left) {
      if (pc.stars > maxStars) maxStars = pc.stars;
    }
  }
  return maxStars;
}

// Sample `count` items without replacement, respecting star budget constraints.
// Partitions pool by star tier: samples up to maxFiveStars five-stars, maxFourStars four-stars,
// then fills remaining slots from lower-star cards. Returns null if constraints cannot be met.
export function weightedSampleConstrained(
  pool: PIMCCard[],
  count: number,
  maxFiveStars: number,
  maxFourStars: number,
): PIMCCard[] | null {
  const fiveStars = pool.filter((c) => c.stars === 5);
  const fourStars = pool.filter((c) => c.stars === 4);
  const other = pool.filter((c) => c.stars < 4);

  const nFive = Math.min(maxFiveStars, fiveStars.length, count);
  const nFour = Math.min(maxFourStars, fourStars.length, count - nFive);
  const nOther = count - nFive - nFour;

  if (nOther < 0 || other.length < nOther) return null;

  const sampled = [
    ...(nFive > 0 ? weightedSample(fiveStars, nFive) : []),
    ...(nFour > 0 ? weightedSample(fourStars, nFour) : []),
    ...(nOther > 0 ? weightedSample(other, nOther) : []),
  ];

  // Shuffle to avoid positional bias from tier ordering.
  for (let i = sampled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sampled[i], sampled[j]] = [sampled[j]!, sampled[i]!];
  }
  return sampled;
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

