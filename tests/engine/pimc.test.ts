// ABOUTME: Tests for the PIMC sampling utilities — weighted candidate sampling and pool construction.
// ABOUTME: Covers weightedSample, buildCandidatePool, computeStarBudgets, and weightedSampleConstrained.
import { describe, it, expect, beforeEach } from 'bun:test';
import { weightedSample, buildCandidatePool, computeStarBudgets, weightedSampleConstrained, type PIMCCard } from '../../src/engine/pimc';
import { createCard, resetCardIds } from '../../src/engine';

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

  it('favors high-stat cards over low-stat cards', () => {
    // One strong card (10,10,1,1) vs four weak cards (1,1,1,1).
    // Non-uniform stats so weight uses top TWO: correct weight = 10+10=20, weak = 1+1=2.
    // With stats[0]+stats[2] bug: strong = 10+1=11, changing the distribution detectably.
    // With constant weight bug: uniform 1/5=20%.
    // Correct P(strong) ≈ 20/(20+8) = 71.4%. Both mutations drop below 63%.
    const strong = makePIMCCard(10, 10, 1, 1);
    const pool: PIMCCard[] = [
      strong,
      makePIMCCard(1, 1, 1, 1),
      makePIMCCard(1, 1, 1, 1),
      makePIMCCard(1, 1, 1, 1),
      makePIMCCard(1, 1, 1, 1),
    ];
    let strongCount = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      const sampled = weightedSample(pool, 1);
      if (sampled[0]!.top === 10) strongCount++;
    }
    expect(strongCount).toBeGreaterThan(trials * 0.63);
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

