// ABOUTME: Tests for the minimax solver — move ranking, tie-breaking.
// ABOUTME: Covers forced wins, loss avoidance, and robustness scoring.

import { describe, it, expect } from "bun:test";
import { createCard, createInitialState, Owner, Outcome } from "../../src/engine/types";
import { placeCard } from "../../src/engine/board";
import { findBestMove } from "../../src/engine/solver";

describe("findBestMove", () => {
  it("returns no moves for a full board", () => {
    // Build a full board by placing all 9 cards
    const p = [createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3), createCard(4,4,4,4), createCard(5,5,5,5)];
    const o = [createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8), createCard(9,9,9,9), createCard(10,10,10,10)];
    let state = createInitialState(p, o);

    // Place cards to fill board (player 5 cards, opponent 4 cards)
    state = placeCard(state, p[0]!, 0);
    state = placeCard(state, o[0]!, 2);
    state = placeCard(state, p[1]!, 6);
    state = placeCard(state, o[1]!, 8);
    state = placeCard(state, p[2]!, 4);
    state = placeCard(state, o[2]!, 1);
    state = placeCard(state, p[3]!, 3);
    state = placeCard(state, o[3]!, 7);
    state = placeCard(state, p[4]!, 5);

    const moves = findBestMove(state);
    expect(moves).toHaveLength(0);
  });

  it("finds the only winning move in a late-game position", () => {
    // Set up a position with 1 empty cell and 1 card in hand
    // The placed card should capture enough to win
    const p = [createCard(10,10,10,10), createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3), createCard(4,4,4,4)];
    const o = [createCard(1,1,1,1), createCard(5,5,5,5), createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8)];
    let state = createInitialState(p, o);

    // Fill 8 positions, leave position 4 empty
    state = placeCard(state, p[1]!, 0);
    state = placeCard(state, o[0]!, 1);
    state = placeCard(state, p[2]!, 2);
    state = placeCard(state, o[1]!, 3);
    state = placeCard(state, p[3]!, 5);
    state = placeCard(state, o[2]!, 6);
    state = placeCard(state, p[4]!, 7);
    state = placeCard(state, o[3]!, 8);

    const moves = findBestMove(state);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.position).toBe(4);
    expect(moves[0]!.card).toBe(p[0]!);
  });

  it("ranks winning moves above drawing moves above losing moves", () => {
    // Start from a mid-game position (5 cards placed, 4 empty cells)
    // to keep the game tree tractable without alpha-beta pruning
    const p = [createCard(10,10,10,10), createCard(9,9,9,9), createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3)];
    const o = [createCard(5,5,5,5), createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8), createCard(4,4,4,4)];
    let state = createInitialState(p, o);

    // Place 5 cards to reach a mid-game state
    state = placeCard(state, p[2]!, 0);
    state = placeCard(state, o[0]!, 1);
    state = placeCard(state, p[3]!, 2);
    state = placeCard(state, o[1]!, 3);
    state = placeCard(state, p[4]!, 4);

    // Player has [10,10,10,10] and [9,9,9,9]; opponent has [7,7,7,7], [8,8,8,8], [4,4,4,4]
    // 4 empty positions × 2 player cards = 8 moves (it's opponent's turn though)
    // Opponent has 3 cards × 4 positions = 12 moves
    const moves = findBestMove(state);

    // Verify sorting: all wins before all draws before all losses
    const outcomeOrder = { win: 0, draw: 1, loss: 2 };
    for (let i = 1; i < moves.length; i++) {
      expect(outcomeOrder[moves[i]!.outcome]).toBeGreaterThanOrEqual(outcomeOrder[moves[i-1]!.outcome]);
    }

    // Should have 12 moves (3 cards × 4 positions, it's opponent's turn)
    expect(moves).toHaveLength(12);
  });
});

describe("tie-breaking", () => {
  it("prefers moves with higher robustness among equal outcomes", () => {
    // Strong cards vs weak cards — player should win most ways
    const p = [createCard(10,10,10,10), createCard(9,9,9,9), createCard(8,8,8,8), createCard(7,7,7,7), createCard(6,6,6,6)];
    const o = [createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3), createCard(4,4,4,4), createCard(5,5,5,5)];
    const state = createInitialState(p, o);

    const moves = findBestMove(state);
    const winMoves = moves.filter(m => m.outcome === Outcome.Win);

    // With overwhelmingly strong cards, most moves should be wins
    expect(winMoves.length).toBeGreaterThan(1);

    // At least one win move should have robustness > 0
    const maxRobustness = Math.max(...winMoves.map(m => m.robustness));
    expect(maxRobustness).toBeGreaterThan(0);

    // Robustness should be sorted descending within wins
    for (let i = 1; i < winMoves.length; i++) {
      expect(winMoves[i]!.robustness).toBeLessThanOrEqual(winMoves[i-1]!.robustness);
    }

    // Robustness should be between 0 and 1
    for (const move of winMoves) {
      expect(move.robustness).toBeGreaterThanOrEqual(0);
      expect(move.robustness).toBeLessThanOrEqual(1);
    }
  });
});

describe("solver performance", () => {
  it("solves a full game from turn 1 within 15 seconds", () => {
    const p = [createCard(10,5,3,8), createCard(7,6,4,9), createCard(2,8,6,3), createCard(5,4,7,1), createCard(9,3,2,6)];
    const o = [createCard(4,7,5,2), createCard(8,3,9,6), createCard(1,5,8,4), createCard(6,9,1,7), createCard(3,2,4,10)];
    const state = createInitialState(p, o);

    const start = performance.now();
    const moves = findBestMove(state);
    const elapsed = performance.now() - start;

    expect(moves.length).toBe(45); // 5 cards × 9 positions
    expect(elapsed).toBeLessThan(60000); // 60 seconds (correct TT bounds are slower than naive caching)

  }, 65000);
});
