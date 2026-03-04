// ABOUTME: Tests for game logic — card placement, captures, combos.
// ABOUTME: Covers standard, Plus, Same, and Combo cascade rules.

import { describe, expect, test } from "bun:test";
import { createCard, createInitialState, Owner, CardType, ADJACENCY } from "../../src/engine/types";
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

describe("standard capture", () => {
  // 5 cards per hand to allow enough turns for setup
  const filler = createCard(1, 1, 1, 1);

  test("captures an adjacent opponent card when value is higher", () => {
    // Opponent card at position 0: left=1 (irrelevant), right=3
    const opCard = createCard(1, 3, 1, 1);
    // Player card at position 1: left=5 attacks opponent's right=3
    const pCard = createCard(1, 1, 1, 5);

    const state = createInitialState(
      [filler, pCard, filler, filler, filler],
      [opCard, filler, filler, filler, filler],
    );

    // Turn 1: Player places filler at position 8 (far corner, non-adjacent to 0 or 1)
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent places opCard at position 0
    s = placeCard(s, opCard, 0);
    // Turn 3: Player places pCard at position 1 (adjacent to 0, left attacks right)
    s = placeCard(s, pCard, 1);

    // Opponent's card at position 0 should be flipped to Player
    expect(s.board[0]!.owner).toBe(Owner.Player);
    expect(s.board[0]!.card).toEqual(opCard);
  });

  test("does not capture when value is equal", () => {
    // Opponent card at position 0: right=5
    const opCard = createCard(1, 5, 1, 1);
    // Player card at position 1: left=5 (equal, should NOT capture)
    const pCard = createCard(1, 1, 1, 5);

    const state = createInitialState(
      [filler, pCard, filler, filler, filler],
      [opCard, filler, filler, filler, filler],
    );

    let s = placeCard(state, filler, 8);
    s = placeCard(s, opCard, 0);
    s = placeCard(s, pCard, 1);

    // Should still be owned by opponent (no capture on equal)
    expect(s.board[0]!.owner).toBe(Owner.Opponent);
  });

  test("does not capture own cards", () => {
    // Player places two cards adjacent to each other
    const pCard1 = createCard(1, 1, 1, 1);
    const pCard2 = createCard(9, 9, 9, 9);

    const state = createInitialState(
      [pCard1, pCard2, filler, filler, filler],
      [filler, filler, filler, filler, filler],
    );

    // Turn 1: Player places pCard1 at position 0
    let s = placeCard(state, pCard1, 0);
    // Turn 2: Opponent places filler at position 8 (far away)
    s = placeCard(s, filler, 8);
    // Turn 3: Player places pCard2 at position 1 (adjacent, higher values)
    s = placeCard(s, pCard2, 1);

    // pCard1 should still be owned by Player (not flipped)
    expect(s.board[0]!.owner).toBe(Owner.Player);
  });

  test("captures multiple adjacent opponent cards", () => {
    // Position 4 (center) is adjacent to 1, 3, 5, 7
    // Place opponent cards at positions 1 and 3, then player captures both from 4
    const opCard1 = createCard(1, 1, 2, 1); // at pos 1, bottom=2 (defends against 4's top)
    const opCard2 = createCard(1, 2, 1, 1); // at pos 3, right=2 (defends against 4's left)
    const pCard = createCard(5, 5, 5, 5);   // at pos 4, all edges=5, beats both

    const state = createInitialState(
      [filler, filler, pCard, filler, filler],
      [opCard1, opCard2, filler, filler, filler],
    );

    // Turn 1: Player places filler at position 8
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent places opCard1 at position 1
    s = placeCard(s, opCard1, 1);
    // Turn 3: Player places filler at position 6
    s = placeCard(s, filler, 6);
    // Turn 4: Opponent places opCard2 at position 3
    s = placeCard(s, opCard2, 3);
    // Turn 5: Player places pCard at position 4 (center)
    s = placeCard(s, pCard, 4);

    // Both opponent cards should be flipped
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[1]!.card).toEqual(opCard1);
    expect(s.board[3]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.card).toEqual(opCard2);
  });
});

describe("same rule", () => {
  const filler = createCard(1, 1, 1, 1);

  test("captures when two or more adjacent pairs have equal touching values", () => {
    // Opponent card at pos 1: bottom=5 (defends against pos 4's top)
    const opCard1 = createCard(1, 1, 5, 1);
    // Opponent card at pos 3: right=7 (defends against pos 4's left)
    const opCard2 = createCard(1, 7, 1, 1);
    // Player card at pos 4: top=5 (matches opCard1 bottom), left=7 (matches opCard2 right)
    // right and bottom are low so standard capture doesn't apply elsewhere
    const pCard = createCard(5, 1, 1, 7);

    const state = createInitialState(
      [filler, filler, pCard, filler, filler],
      [opCard1, opCard2, filler, filler, filler],
    );

    // Turn 1: Player at pos 8
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent at pos 1
    s = placeCard(s, opCard1, 1);
    // Turn 3: Player at pos 6
    s = placeCard(s, filler, 6);
    // Turn 4: Opponent at pos 3
    s = placeCard(s, opCard2, 3);
    // Turn 5: Player places pCard at pos 4
    s = placeCard(s, pCard, 4);

    // Same triggers: both opponent cards flipped
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.owner).toBe(Owner.Player);
  });

  test("does not trigger same with only one matching pair", () => {
    // Opponent card at pos 1: bottom=5 (defends against pos 4's top)
    const opCard1 = createCard(1, 1, 5, 1);
    // Opponent card at pos 3: right=9 (defends against pos 4's left)
    const opCard2 = createCard(1, 9, 1, 1);
    // Player card at pos 4: top=5 (matches opCard1), left=7 (does NOT match opCard2's 9)
    // left=7 < right=9, so standard capture also fails
    const pCard = createCard(5, 1, 1, 7);

    const state = createInitialState(
      [filler, filler, pCard, filler, filler],
      [opCard1, opCard2, filler, filler, filler],
    );

    let s = placeCard(state, filler, 8);
    s = placeCard(s, opCard1, 1);
    s = placeCard(s, filler, 6);
    s = placeCard(s, opCard2, 3);
    s = placeCard(s, pCard, 4);

    // Only 1 same pair — not enough to trigger Same
    // Standard capture: top=5 vs bottom=5 (not >), left=7 vs right=9 (not >)
    // Neither card should be captured
    expect(s.board[1]!.owner).toBe(Owner.Opponent);
    expect(s.board[3]!.owner).toBe(Owner.Opponent);
  });

  test("counts friendly cards toward same pairs but does not capture them", () => {
    // Player card at pos 1: bottom=5 (defends against pos 4's top)
    const pCard1 = createCard(1, 1, 5, 1);
    // Opponent card at pos 3: right=7 (defends against pos 4's left)
    const opCard = createCard(1, 7, 1, 1);
    // Player card at pos 4: top=5 (matches pCard1), left=7 (matches opCard)
    const pCard2 = createCard(5, 1, 1, 7);

    const state = createInitialState(
      [pCard1, filler, pCard2, filler, filler],
      [opCard, filler, filler, filler, filler],
    );

    // Turn 1: Player places pCard1 at pos 1
    let s = placeCard(state, pCard1, 1);
    // Turn 2: Opponent places opCard at pos 3
    s = placeCard(s, opCard, 3);
    // Turn 3: Player places filler at pos 8
    s = placeCard(s, filler, 8);
    // Turn 4: Opponent places filler at pos 6
    s = placeCard(s, filler, 6);
    // Turn 5: Player places pCard2 at pos 4
    s = placeCard(s, pCard2, 4);

    // 2 same pairs (1 friendly + 1 opponent) — Same triggers
    // Opponent card at 3 flips, player card at 1 stays player-owned
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.owner).toBe(Owner.Player);
  });
});

describe("plus rule", () => {
  const filler = createCard(1, 1, 1, 1);

  test("captures when two or more adjacent pairs have equal sums", () => {
    // Opponent card at pos 1: bottom=5 (defends against pos 4's top)
    const opCard1 = createCard(1, 1, 5, 1);
    // Opponent card at pos 3: right=7 (defends against pos 4's left)
    const opCard2 = createCard(1, 7, 1, 1);
    // Player card at pos 4: top=3 (sum with opp1: 3+5=8), left=1 (sum with opp2: 1+7=8)
    // Standard capture: top=3 vs bottom=5 (not >), left=1 vs right=7 (not >)
    const pCard = createCard(3, 1, 1, 1);

    const state = createInitialState(
      [filler, filler, pCard, filler, filler],
      [opCard1, opCard2, filler, filler, filler],
    );

    // Turn 1: Player at pos 8
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent at pos 1
    s = placeCard(s, opCard1, 1);
    // Turn 3: Player at pos 6
    s = placeCard(s, filler, 6);
    // Turn 4: Opponent at pos 3
    s = placeCard(s, opCard2, 3);
    // Turn 5: Player places pCard at pos 4
    s = placeCard(s, pCard, 4);

    // Plus triggers: both opponent cards flipped
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.owner).toBe(Owner.Player);
  });

  test("does not trigger plus with only one pair", () => {
    // Only one adjacent opponent card — Plus needs 2+ pairs with equal sums
    // Opponent card at pos 1: bottom=5
    const opCard = createCard(1, 1, 5, 1);
    // Player card at pos 4: top=3 (sum=8), no other adjacent cards
    // left=1 so standard capture won't trigger on pos 1 (3 < 5)
    const pCard = createCard(3, 1, 1, 1);

    const state = createInitialState(
      [filler, filler, pCard, filler, filler],
      [opCard, filler, filler, filler, filler],
    );

    // Turn 1: Player at pos 8
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent at pos 1
    s = placeCard(s, opCard, 1);
    // Turn 3: Player places pCard at pos 4
    s = placeCard(s, pCard, 4);

    // Only 1 adjacent pair — Plus does not trigger
    // Standard capture: top=3 vs bottom=5 (not >), no capture
    expect(s.board[1]!.owner).toBe(Owner.Opponent);
  });

  test("counts friendly cards toward plus pairs but does not capture them", () => {
    // Player card at pos 1: bottom=5 (defends against pos 4's top)
    const pCard1 = createCard(1, 1, 5, 1);
    // Opponent card at pos 3: right=7 (defends against pos 4's left)
    const opCard = createCard(1, 7, 1, 1);
    // Player card at pos 4: top=3 (sum with pCard1: 3+5=8), left=1 (sum with opCard: 1+7=8)
    // Standard capture: left=1 vs right=7 (not >), so Plus is the only way to flip
    const pCard2 = createCard(3, 1, 1, 1);

    const state = createInitialState(
      [pCard1, filler, pCard2, filler, filler],
      [opCard, filler, filler, filler, filler],
    );

    // Turn 1: Player places pCard1 at pos 1
    let s = placeCard(state, pCard1, 1);
    // Turn 2: Opponent places opCard at pos 3
    s = placeCard(s, opCard, 3);
    // Turn 3: Player places filler at pos 8
    s = placeCard(s, filler, 8);
    // Turn 4: Opponent places filler at pos 6
    s = placeCard(s, filler, 6);
    // Turn 5: Player places pCard2 at pos 4
    s = placeCard(s, pCard2, 4);

    // 2 plus pairs (1 friendly + 1 opponent, both sum=8) — Plus triggers
    // Opponent card at 3 flips, player card at 1 stays player-owned
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.owner).toBe(Owner.Player);
  });
});
