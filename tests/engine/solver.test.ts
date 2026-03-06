// ABOUTME: Tests for the minimax solver — move ranking, tie-breaking.
// ABOUTME: Covers forced wins, loss avoidance, and robustness scoring.

import { describe, it, expect } from "bun:test";
import { type Board, type GameState, createCard, createInitialState, Owner, Outcome } from "../../src/engine/types";
import { placeCard } from "../../src/engine/board";
import { findBestMove, createSolver } from "../../src/engine/solver";

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
  it("among draw moves, prefers the one where more opponent responses lead to player winning", () => {
    // Board: 0-6 filled, 7 and 8 empty. Player has P, opponent has O1 (weak) and O2 (strong).
    //
    // P at pos 7 captures pos 6 (opponent). After that:
    //   - O1 at 8: too weak to recapture → Player WIN
    //   - O2 at 8: strong enough to recapture pos 5 → DRAW
    //   minimax(P@7) = min(Win, Draw) = Draw. betterForUs = 1/2 = 0.5
    //
    // P at pos 8: no captures. After that:
    //   - O1 at 7: too weak to capture → DRAW
    //   - O2 at 7: pos 4 defends (bottom=10) and pos 8 defends (left=10) → DRAW
    //   minimax(P@8) = min(Draw, Draw) = Draw. betterForUs = 0/2 = 0
    //
    // Correct sort: P@7 first (more opponent mistakes). Old code (sameOutcome): P@8 first.
    const filler = createCard(1, 1, 1, 1);
    const pos4Card = createCard(1, 1, 10, 1); // bottom=10 blocks O2@7 from capturing pos 4
    const P = createCard(10, 10, 1, 10);      // top=10, right=10, left=10; placed by player
    const O1 = createCard(1, 1, 1, 1);        // weak — opponent mistake
    const O2 = createCard(10, 10, 10, 10);    // strong — optimal opponent play

    // Board layout (row-major):
    //  0(P)  1(O)  2(P)
    //  3(O)  4(P)  5(P)
    //  6(O)  7(-)  8(-)
    const board = [
      { card: filler,   owner: Owner.Player   },  // 0
      { card: filler,   owner: Owner.Opponent },  // 1
      { card: filler,   owner: Owner.Player   },  // 2
      { card: filler,   owner: Owner.Opponent },  // 3
      { card: pos4Card, owner: Owner.Player   },  // 4
      { card: filler,   owner: Owner.Player   },  // 5
      { card: filler,   owner: Owner.Opponent },  // 6
      null,                                        // 7 (empty)
      null,                                        // 8 (empty)
    ] as Board;

    const state: GameState = {
      board,
      playerHand: [P],
      opponentHand: [O1, O2],
      currentTurn: Owner.Player,
      rules: { plus: false, same: false },
    };

    const moves = findBestMove(state);

    expect(moves).toHaveLength(2);
    expect(moves.every(m => m.outcome === Outcome.Draw)).toBe(true);
    // P@7 should rank first — opponent has one "mistake" response (O1) that hands us a win
    expect(moves[0]!.position).toBe(7);
    expect(moves[1]!.position).toBe(8);
  });

  it("prefers moves with higher robustness among equal outcomes", () => {
    // Strong cards vs weak cards — player should win most ways
    const p = [createCard(10,10,10,10), createCard(9,9,9,9), createCard(8,8,8,8), createCard(7,7,7,7), createCard(6,6,6,6)];
    const o = [createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3), createCard(4,4,4,4), createCard(5,5,5,5)];
    const state = createInitialState(p, o);

    const moves = findBestMove(state);
    const winMoves = moves.filter(m => m.outcome === Outcome.Win);

    // With overwhelmingly strong cards, most moves should be wins
    expect(winMoves.length).toBeGreaterThan(1);

    // Winning moves always have robustness = 0: no opponent response can exceed a win,
    // so there are no opponent "mistakes" that improve our outcome further.
    for (const move of winMoves) {
      expect(move.robustness).toBe(0);
    }
  });
});

describe("findBestMove — additional scenarios", () => {
  it("evaluates from the current player's perspective when opponent goes first", () => {
    // Opponent has all-10 cards, player has all-1 cards. Opponent moves first.
    // All of opponent's moves should be Wins (from opponent's perspective).
    const p = Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
    const o = Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
    const state = createInitialState(p, o, Owner.Opponent);

    const moves = findBestMove(state);

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(m => m.outcome === Outcome.Win)).toBe(true);
  });

  it("returns ranked moves and sorts them when all outcomes are losses", () => {
    // Player has 1 weak card; opponent has 2 strong cards + already dominates the board.
    // All 3 player moves are losses, but they should still be returned and sorted.
    const weakCard   = createCard(1, 1, 1, 1);
    const strongCard = createCard(10, 10, 10, 10);

    const board = [
      { card: weakCard,   owner: Owner.Player   },  // 0
      { card: weakCard,   owner: Owner.Player   },  // 1
      { card: weakCard,   owner: Owner.Opponent },  // 2
      { card: weakCard,   owner: Owner.Opponent },  // 3
      { card: weakCard,   owner: Owner.Opponent },  // 4
      { card: weakCard,   owner: Owner.Opponent },  // 5
      null, null, null,
    ] as Board;

    const state: GameState = {
      board,
      playerHand:   [weakCard],
      opponentHand: [strongCard, strongCard],
      currentTurn: Owner.Player,
      rules: { plus: false, same: false },
    };

    const moves = findBestMove(state);

    // 3 empty positions × 1 card = 3 moves, all losses
    expect(moves).toHaveLength(3);
    expect(moves.every(m => m.outcome === Outcome.Loss)).toBe(true);
    // Still sorted: robustness descending within the loss bucket
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i]!.robustness).toBeLessThanOrEqual(moves[i-1]!.robustness);
    }
  });
});

describe("createSolver", () => {
  // Mid-game state: 5 cards placed, it's opponent's turn (3 cards × 4 positions)
  // Fast enough for correctness checks without 21s full-game search.
  function makeMidGame() {
    const p = [createCard(10,10,10,10), createCard(9,9,9,9), createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3)];
    const o = [createCard(5,5,5,5), createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8), createCard(4,4,4,4)];
    let state = createInitialState(p, o);
    state = placeCard(state, p[2]!, 0);
    state = placeCard(state, o[0]!, 1);
    state = placeCard(state, p[3]!, 2);
    state = placeCard(state, o[1]!, 3);
    state = placeCard(state, p[4]!, 4);
    return { state, p, o };
  }

  it("returns a solver with solve() and reset()", () => {
    const solver = createSolver();
    expect(typeof solver.solve).toBe("function");
    expect(typeof solver.reset).toBe("function");
  });

  it("solve() returns the same moves as findBestMove() for an initial state", () => {
    // Use identical hands so deduplication keeps the search fast (~14ms).
    // Initial state (no placed cards) ensures buildCardIndex has all cards
    // — no NaN hashing for board cells in either code path.
    const p = Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
    const o = Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
    const state = createInitialState(p, o);
    const solver = createSolver();
    solver.reset(p, o);
    const solverMoves = solver.solve(state);
    const directMoves = findBestMove(state);
    expect(solverMoves.map(m => m.outcome)).toEqual(directMoves.map(m => m.outcome));
    expect(solverMoves.map(m => m.position)).toEqual(directMoves.map(m => m.position));
  });

  it("reuses TT across solve() calls (second call faster than first)", () => {
    // Use distinct cards so deduplication doesn't collapse the search tree,
    // giving the TT meaningful work to cache.
    const p = [createCard(10,5,3,8), createCard(7,6,4,9), createCard(2,8,6,3), createCard(5,4,7,1), createCard(9,3,2,6)];
    const o = [createCard(4,7,5,2), createCard(8,3,9,6), createCard(1,5,8,4), createCard(6,9,1,7), createCard(3,2,4,10)];
    let state = createInitialState(p, o);
    // Place 3 cards (leaving 3p + 4o remaining, 6 empty cells, player's turn)
    state = placeCard(state, p[2]!, 0);
    state = placeCard(state, o[0]!, 1);
    state = placeCard(state, p[3]!, 2);

    const solver = createSolver();
    solver.reset(p, o);

    const t0 = performance.now();
    solver.solve(state);
    const firstCallMs = performance.now() - t0;

    const t1 = performance.now();
    solver.solve(state); // same state — TT is warm
    const secondCallMs = performance.now() - t1;

    expect(secondCallMs).toBeLessThan(firstCallMs / 10);
  });
});

describe("findBestMove — mid-game correctness", () => {
  it("gives correct outcomes when board contains cards no longer in any hand", () => {
    // After 5 cards are placed, board cells hold cards absent from remaining hands.
    // buildCardIndex must include those board cards for TT hashing to be correct.
    const p = [createCard(10,5,3,8), createCard(7,6,4,9), createCard(2,8,6,3), createCard(5,4,7,1), createCard(9,3,2,6)];
    const o = [createCard(4,7,5,2), createCard(8,3,9,6), createCard(1,5,8,4), createCard(6,9,1,7), createCard(3,2,4,10)];
    let state = createInitialState(p, o);
    state = placeCard(state, p[2]!, 0);
    state = placeCard(state, o[0]!, 1);
    state = placeCard(state, p[3]!, 2);
    state = placeCard(state, o[1]!, 3);
    state = placeCard(state, p[4]!, 4);

    // createSolver with reset() correctly indexes all original cards — use as reference
    const solver = createSolver();
    solver.reset(p, o);
    const referenceMoves = solver.solve(state);

    const directMoves = findBestMove(state);

    expect(directMoves.map(m => m.outcome)).toEqual(referenceMoves.map(m => m.outcome));
    expect(directMoves.map(m => m.position)).toEqual(referenceMoves.map(m => m.position));
  });
});

describe("createSolver — TT persistence", () => {
  it("TT is empty after reset()", () => {
    const p = Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
    const o = Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
    const solver = createSolver();
    solver.reset(p, o);
    expect(solver.ttSize()).toBe(0);
  });

  it("TT is populated after solve()", () => {
    const p = Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
    const o = Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
    const state = createInitialState(p, o);
    const solver = createSolver();
    solver.reset(p, o);
    solver.solve(state);
    expect(solver.ttSize()).toBeGreaterThan(0);
  });

  it("TT size is unchanged when solving the same state twice (all hits)", () => {
    const p = Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
    const o = Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
    const state = createInitialState(p, o);
    const solver = createSolver();
    solver.reset(p, o);
    solver.solve(state);
    const sizeAfterFirst = solver.ttSize();
    solver.solve(state);
    expect(solver.ttSize()).toBe(sizeAfterFirst);
  });
});

describe("solver performance", () => {
  it("solves a full game from turn 1 within 25 seconds", () => {
    const p = [createCard(10,5,3,8), createCard(7,6,4,9), createCard(2,8,6,3), createCard(5,4,7,1), createCard(9,3,2,6)];
    const o = [createCard(4,7,5,2), createCard(8,3,9,6), createCard(1,5,8,4), createCard(6,9,1,7), createCard(3,2,4,10)];
    const state = createInitialState(p, o);

    const start = performance.now();
    const moves = findBestMove(state);
    const elapsed = performance.now() - start;

    expect(moves.length).toBe(45); // 5 cards × 9 positions
    expect(elapsed).toBeLessThan(25000); // 25 seconds

  }, 30000);
});
