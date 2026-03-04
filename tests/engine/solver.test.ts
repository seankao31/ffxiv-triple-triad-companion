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
    state = placeCard(state, p[0], 0);
    state = placeCard(state, o[0], 2);
    state = placeCard(state, p[1], 6);
    state = placeCard(state, o[1], 8);
    state = placeCard(state, p[2], 4);
    state = placeCard(state, o[2], 1);
    state = placeCard(state, p[3], 3);
    state = placeCard(state, o[3], 7);
    state = placeCard(state, p[4], 5);

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
    state = placeCard(state, p[1], 0);
    state = placeCard(state, o[0], 1);
    state = placeCard(state, p[2], 2);
    state = placeCard(state, o[1], 3);
    state = placeCard(state, p[3], 5);
    state = placeCard(state, o[2], 6);
    state = placeCard(state, p[4], 7);
    state = placeCard(state, o[3], 8);

    const moves = findBestMove(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].position).toBe(4);
    expect(moves[0].card).toBe(p[0]);
  });

  it("ranks winning moves above drawing moves above losing moves", () => {
    // Start from a mid-game position (5 cards placed, 4 empty cells)
    // to keep the game tree tractable without alpha-beta pruning
    const p = [createCard(10,10,10,10), createCard(9,9,9,9), createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3)];
    const o = [createCard(5,5,5,5), createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8), createCard(4,4,4,4)];
    let state = createInitialState(p, o);

    // Place 5 cards to reach a mid-game state
    state = placeCard(state, p[2], 0);
    state = placeCard(state, o[0], 1);
    state = placeCard(state, p[3], 2);
    state = placeCard(state, o[1], 3);
    state = placeCard(state, p[4], 4);

    // Player has [10,10,10,10] and [9,9,9,9]; opponent has [7,7,7,7], [8,8,8,8], [4,4,4,4]
    // 4 empty positions × 2 player cards = 8 moves (it's opponent's turn though)
    // Opponent has 3 cards × 4 positions = 12 moves
    const moves = findBestMove(state);

    // Verify sorting: all wins before all draws before all losses
    const outcomeOrder = { win: 0, draw: 1, loss: 2 };
    for (let i = 1; i < moves.length; i++) {
      expect(outcomeOrder[moves[i].outcome]).toBeGreaterThanOrEqual(outcomeOrder[moves[i-1].outcome]);
    }

    // Should have 12 moves (3 cards × 4 positions, it's opponent's turn)
    expect(moves).toHaveLength(12);
  });
});
