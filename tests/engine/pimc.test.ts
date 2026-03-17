// ABOUTME: Tests for the PIMC solver — weighted candidate sampling, pool construction, and simulation.
// ABOUTME: Covers weightedSample, buildCandidatePool, and runPIMC integration.
import { describe, it, expect, beforeEach } from 'bun:test';
import { weightedSample, buildCandidatePool, runPIMC, computeStarBudgets, weightedSampleConstrained, type PIMCCard } from '../../src/engine/pimc';
import { createCard, createInitialState, Owner, Outcome, resetCardIds, type Card } from '../../src/engine';
import { createPlaceholderCard } from '../../src/engine/types';

function makePIMCCard(top: number, right: number, bottom: number, left: number, owned = 1, stars = 3): PIMCCard {
  return { top, right, bottom, left, type: 'none', owned, stars };
}

describe('weightedSample', () => {
  it('returns the requested number of items', () => {
    const pool: PIMCCard[] = [
      makePIMCCard(5, 5, 5, 5),
      makePIMCCard(7, 6, 6, 7),
      makePIMCCard(3, 3, 4, 3),
      makePIMCCard(8, 7, 5, 6),
    ];
    const sampled = weightedSample(pool, 2);
    expect(sampled).toHaveLength(2);
  });

  it('returns items without replacement (no duplicates)', () => {
    const pool: PIMCCard[] = Array.from({ length: 10 }, (_, i) => makePIMCCard(i + 1, 1, 1, 1));
    const sampled = weightedSample(pool, 5);
    const tops = sampled.map((c) => c.top);
    expect(new Set(tops).size).toBe(5);
  });

  it('throws if requested count exceeds pool size', () => {
    const pool: PIMCCard[] = [makePIMCCard(5, 5, 5, 5)];
    expect(() => weightedSample(pool, 2)).toThrow();
  });

  it('always returns the only item when pool has one element', () => {
    const pool: PIMCCard[] = [makePIMCCard(5, 5, 5, 5)];
    const sampled = weightedSample(pool, 1);
    expect(sampled).toHaveLength(1);
    expect(sampled[0]!.top).toBe(5);
  });
});

describe('buildCandidatePool', () => {
  it('excludes cards with IDs in the known set', () => {
    const all: PIMCCard[] = [
      { ...makePIMCCard(5, 5, 5, 5), id: 100 },
      { ...makePIMCCard(7, 7, 7, 7), id: 200 },
      { ...makePIMCCard(3, 3, 3, 3), id: 300 },
    ];
    const knownIds = new Set([100, 200]);
    const pool = buildCandidatePool(all, knownIds);
    expect(pool).toHaveLength(1);
    expect(pool[0]!.id).toBe(300);
  });

  it('returns all cards when known set is empty', () => {
    const all: PIMCCard[] = [
      { ...makePIMCCard(5, 5, 5, 5), id: 100 },
      { ...makePIMCCard(7, 7, 7, 7), id: 200 },
    ];
    const pool = buildCandidatePool(all, new Set());
    expect(pool).toHaveLength(2);
  });

  it('excludes cards with owned = 0', () => {
    const all: PIMCCard[] = [
      { ...makePIMCCard(5, 5, 5, 5, 0), id: 100 },
      { ...makePIMCCard(7, 7, 7, 7, 1), id: 200 },
    ];
    const pool = buildCandidatePool(all, new Set());
    expect(pool).toHaveLength(1);
    expect(pool[0]!.id).toBe(200);
  });
});

describe('computeStarBudgets', () => {
  const allCards: PIMCCard[] = [
    { ...makePIMCCard(5, 5, 5, 5), id: 100, stars: 5 },
    { ...makePIMCCard(4, 4, 4, 4), id: 101, stars: 4 },
    { ...makePIMCCard(3, 3, 3, 3), id: 102, stars: 3 },
  ];

  beforeEach(() => { resetCardIds(); });

  it('with no known cards, budget is max (1 five-star, 2 four-stars)', () => {
    const budget = computeStarBudgets([], allCards);
    expect(budget.maxFiveStars).toBe(1);
    expect(budget.maxFourStars).toBe(2);
  });

  it('with 1 known 5-star, budget is (0 five-stars, 1 four-star)', () => {
    const card = createCard(5, 5, 5, 5);
    const budget = computeStarBudgets([card], allCards);
    expect(budget.maxFiveStars).toBe(0);
    expect(budget.maxFourStars).toBe(1);
  });

  it('with 1 known 4-star, budget is (1 five-star, 1 four-star)', () => {
    const card = createCard(4, 4, 4, 4);
    const budget = computeStarBudgets([card], allCards);
    expect(budget.maxFiveStars).toBe(1);
    expect(budget.maxFourStars).toBe(1);
  });

  it('with 2 known 4-stars, budget is (1 five-star, 0 four-stars)', () => {
    const cards = [createCard(4, 4, 4, 4), createCard(4, 4, 4, 4)];
    const budget = computeStarBudgets(cards, allCards);
    expect(budget.maxFiveStars).toBe(1);
    expect(budget.maxFourStars).toBe(0);
  });

  it('with 1 five-star and 1 four-star, budget is (0, 0)', () => {
    const cards = [createCard(5, 5, 5, 5), createCard(4, 4, 4, 4)];
    const budget = computeStarBudgets(cards, allCards);
    expect(budget.maxFiveStars).toBe(0);
    expect(budget.maxFourStars).toBe(0);
  });

  it('with unrecognized card stats, treats card as below 4-star (no budget reduction)', () => {
    const card = createCard(9, 8, 7, 6);
    const budget = computeStarBudgets([card], allCards);
    expect(budget.maxFiveStars).toBe(1);
    expect(budget.maxFourStars).toBe(2);
  });
});

describe('weightedSampleConstrained', () => {
  const pool: PIMCCard[] = [
    makePIMCCard(9, 9, 9, 9, 1, 5),
    makePIMCCard(8, 8, 8, 8, 1, 5),
    makePIMCCard(7, 7, 7, 7, 1, 4),
    makePIMCCard(6, 6, 6, 6, 1, 4),
    makePIMCCard(5, 5, 5, 5, 1, 3),
    makePIMCCard(4, 4, 4, 4, 1, 3),
    makePIMCCard(3, 3, 3, 3, 1, 2),
  ];

  it('returns exactly count items', () => {
    const result = weightedSampleConstrained(pool, 3, 1, 1);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(3);
  });

  it('respects maxFiveStars=0 by excluding all 5-star cards', () => {
    for (let i = 0; i < 20; i++) {
      const result = weightedSampleConstrained(pool, 3, 0, 2)!;
      expect(result.every((c) => c.stars !== 5)).toBe(true);
    }
  });

  it('respects maxFourStars=0 by excluding all 4-star cards', () => {
    for (let i = 0; i < 20; i++) {
      const result = weightedSampleConstrained(pool, 3, 1, 0)!;
      expect(result.every((c) => c.stars !== 4)).toBe(true);
    }
  });

  it('never includes more than maxFiveStars five-star cards', () => {
    for (let i = 0; i < 30; i++) {
      const result = weightedSampleConstrained(pool, 4, 1, 1)!;
      const fiveCount = result.filter((c) => c.stars === 5).length;
      expect(fiveCount).toBeLessThanOrEqual(1);
    }
  });

  it('returns null when constraints cannot be satisfied', () => {
    // pool has only 3 cards below 4-star; requesting 4 with maxFiveStars=0 and maxFourStars=0
    const result = weightedSampleConstrained(pool, 4, 0, 0);
    expect(result).toBeNull();
  });

  it('returns items without replacement', () => {
    const result = weightedSampleConstrained(pool, 5, 1, 2)!;
    const tops = result!.map((c) => c.top);
    expect(new Set(tops).size).toBe(5);
  });
});

describe('runPIMC', () => {
  // Reset card IDs before each test so IDs stay in 0–9 range (hash encoding limit < 15)
  beforeEach(() => { resetCardIds(); });

  // Helper: build a simple game state with 1 unknown opponent slot (slot 4 → placeholder ID 9)
  function makeThreeOpenState() {
    const playerHand = [
      createCard(10, 10, 10, 10), // ID 0
      createCard(10, 10, 10, 10), // ID 1
      createCard(10, 10, 10, 10), // ID 2
      createCard(10, 10, 10, 10), // ID 3
      createCard(10, 10, 10, 10), // ID 4
    ];
    const placeholder = createPlaceholderCard(9); // slot 4: playerHandSize(5) + slotIndex(4) = 9
    const opponentHand: ReturnType<typeof createCard>[] = [
      createCard(1, 1, 1, 1), // ID 5
      createCard(1, 1, 1, 1), // ID 6
      createCard(1, 1, 1, 1), // ID 7
      createCard(1, 1, 1, 1), // ID 8
      placeholder,             // ID 9 (explicit)
    ];
    const state = createInitialState(playerHand, opponentHand, Owner.Player);
    const unknownCardIds = new Set([placeholder.id]);
    const pool: PIMCCard[] = [
      { ...makePIMCCard(1, 1, 1, 1), id: 1000 },
      { ...makePIMCCard(2, 2, 2, 2), id: 1001 },
    ];
    return { state, unknownCardIds, pool };
  }

  it('returns RankedMove[] sorted by confidence descending', () => {
    const { state, unknownCardIds, pool } = makeThreeOpenState();
    const moves = runPIMC(state, unknownCardIds, pool, 10);
    expect(moves.length).toBeGreaterThan(0);
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i - 1]!.confidence).toBeGreaterThanOrEqual(moves[i]!.confidence ?? 0);
    }
  });

  it('populates confidence field on returned moves', () => {
    const { state, unknownCardIds, pool } = makeThreeOpenState();
    const moves = runPIMC(state, unknownCardIds, pool, 5);
    for (const move of moves) {
      expect(move.confidence).toBeGreaterThanOrEqual(0);
      expect(move.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('confidence values sum to 1 across all top moves', () => {
    const { state, unknownCardIds, pool } = makeThreeOpenState();
    const moves = runPIMC(state, unknownCardIds, pool, 10);
    const total = moves.reduce((sum, m) => sum + (m.confidence ?? 0), 0);
    expect(total).toBeCloseTo(1, 5);
  });
});
