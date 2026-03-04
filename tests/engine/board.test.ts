// ABOUTME: Tests for game logic — card placement, captures, combos.
// ABOUTME: Covers standard, Plus, Same, and Combo cascade rules.

import { describe, expect, test } from "bun:test";
import { createCard, createInitialState, Owner, CardType } from "../../src/engine/types";
import { placeCard } from "../../src/engine/board";

describe("placeCard", () => {
  const card1 = createCard(1, 2, 3, 4);
  const card2 = createCard(5, 6, 7, 8);
  const card3 = createCard(2, 3, 4, 5);
  const opponentCard1 = createCard(9, 8, 7, 6);
  const opponentCard2 = createCard(3, 4, 5, 6);

  test("places a card on an empty cell", () => {
    const state = createInitialState([card1, card2], [opponentCard1, opponentCard2]);

    const result = placeCard(state, card1, 0);

    // Board cell has the card with correct owner
    expect(result.board[0]).toEqual({ card: card1, owner: Owner.Player });
    // Hand shrinks by 1
    expect(result.playerHand).toEqual([card2]);
    // Turn switches
    expect(result.currentTurn).toBe(Owner.Opponent);
  });

  test("throws when placing on an occupied cell", () => {
    const state = createInitialState([card1, card2], [opponentCard1, opponentCard2]);
    const afterFirst = placeCard(state, card1, 4);

    expect(() => placeCard(afterFirst, opponentCard1, 4)).toThrow();
  });

  test("throws when placing a card not in the current player's hand", () => {
    const state = createInitialState([card1, card2], [opponentCard1, opponentCard2]);

    // card3 is not in either hand
    expect(() => placeCard(state, card3, 0)).toThrow();
    // opponent's card is not in player's hand
    expect(() => placeCard(state, opponentCard1, 0)).toThrow();
  });

  test("throws when position is out of range", () => {
    const state = createInitialState([card1, card2], [opponentCard1, opponentCard2]);

    expect(() => placeCard(state, card1, -1)).toThrow();
    expect(() => placeCard(state, card1, 9)).toThrow();
  });
});
