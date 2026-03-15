// ABOUTME: Tests for game logic — card placement, captures, combos.
// ABOUTME: Covers standard, Plus, Same, and Combo cascade rules.

import { describe, expect, test } from "bun:test";
import { type Board, type GameState, createCard, createInitialState, getScore, Owner } from "../../src/engine/types";
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
      Owner.Player,
      { plus: false, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
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
      Owner.Player,
      { plus: false, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
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
      Owner.Player,
      { plus: false, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
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
      Owner.Player,
      { plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
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
      Owner.Player,
      { plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
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
      Owner.Player,
      { plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
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

describe("combo cascade", () => {
  const filler = createCard(1, 1, 1, 1);

  test("flipped cards from Same trigger standard captures on their neighbors", () => {
    // Board layout:
    //   0(opp) 1(opp) 2
    //   3(opp) 4(plr) 5
    //   6      7      8
    //
    // Player places at 4, Same triggers flipping 1 and 3.
    // Combo: flipped card at 1 has left=9, beats opp card at 0's right=1.

    const opp0 = createCard(1, 1, 1, 1); // right=1 (weak, will be combo-captured)
    const opp1 = createCard(1, 1, 7, 9); // bottom=7 (same as player4's top), left=9 (combo attacks 0)
    const opp3 = createCard(1, 3, 1, 1); // right=3 (same as player4's left)
    const plr4 = createCard(7, 1, 1, 3); // top=7, left=3 → Same triggers (2 pairs)

    const state = createInitialState(
      [filler, filler, plr4, filler, filler],
      [opp0, opp1, opp3, filler, filler],
      Owner.Player,
      { plus: false, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
    );

    // Turn 1: Player at pos 8
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent at pos 0
    s = placeCard(s, opp0, 0);
    // Turn 3: Player at pos 6
    s = placeCard(s, filler, 6);
    // Turn 4: Opponent at pos 1
    s = placeCard(s, opp1, 1);
    // Turn 5: Player at pos 2
    s = placeCard(s, filler, 2);
    // Turn 6: Opponent at pos 3
    s = placeCard(s, opp3, 3);
    // Turn 7: Player places plr4 at pos 4
    s = placeCard(s, plr4, 4);

    // Same flips 1 and 3
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.owner).toBe(Owner.Player);
    // Combo: card at 1 (left=9) > card at 0 (right=1) → flips 0
    expect(s.board[0]!.owner).toBe(Owner.Player);
  });

  test("combo does NOT re-trigger Plus or Same", () => {
    // Same layout as above but card values designed so combo standard capture
    // cannot flip card at 0 (equal values), and Same re-trigger would be needed.

    const opp0 = createCard(5, 5, 5, 5); // right=5, can't be standard-captured (5 is not < 5)
    const opp1 = createCard(1, 1, 7, 5); // bottom=7, left=5 (same as opp0's right, but no re-trigger)
    const opp3 = createCard(1, 3, 1, 1); // right=3
    const plr4 = createCard(7, 1, 1, 3); // top=7, left=3 → Same triggers

    const state = createInitialState(
      [filler, filler, plr4, filler, filler],
      [opp0, opp1, opp3, filler, filler],
      Owner.Player,
      { plus: false, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
    );

    // Turn 1: Player at pos 8
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent at pos 0
    s = placeCard(s, opp0, 0);
    // Turn 3: Player at pos 6
    s = placeCard(s, filler, 6);
    // Turn 4: Opponent at pos 1
    s = placeCard(s, opp1, 1);
    // Turn 5: Player at pos 2
    s = placeCard(s, filler, 2);
    // Turn 6: Opponent at pos 3
    s = placeCard(s, opp3, 3);
    // Turn 7: Player places plr4 at pos 4
    s = placeCard(s, plr4, 4);

    // Same flips 1 and 3
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.owner).toBe(Owner.Player);
    // Combo from 1: left=5 vs 0's right=5 → 5 > 5 is false → no capture
    // Card at 0 should remain Opponent
    expect(s.board[0]!.owner).toBe(Owner.Opponent);
  });
});

describe("edge cases", () => {
  const filler = createCard(1, 1, 1, 1);

  test("corner card has only 2 neighbors", () => {
    // Position 0 (top-left corner) has 2 neighbors: 1 (right/left) and 3 (bottom/top)
    // Place opponent cards at 1 and 3 with low defending values, then capture both from 0
    const opCard1 = createCard(1, 1, 1, 2); // at pos 1, left=2 (defends against pos 0's right)
    const opCard2 = createCard(2, 1, 1, 1); // at pos 3, top=2 (defends against pos 0's bottom)
    const pCard = createCard(1, 5, 5, 1);   // at pos 0, right=5 attacks 1's left=2, bottom=5 attacks 3's top=2

    const state = createInitialState(
      [filler, filler, pCard, filler, filler],
      [opCard1, opCard2, filler, filler, filler],
    );

    // Turn 1: Player at pos 8 (away from action)
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent places opCard1 at pos 1
    s = placeCard(s, opCard1, 1);
    // Turn 3: Player at pos 6 (away from action)
    s = placeCard(s, filler, 6);
    // Turn 4: Opponent places opCard2 at pos 3
    s = placeCard(s, opCard2, 3);
    // Turn 5: Player places pCard at pos 0 (corner)
    s = placeCard(s, pCard, 0);

    // Both neighbors captured via standard capture
    expect(s.board[0]!.owner).toBe(Owner.Player);
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[3]!.owner).toBe(Owner.Player);
  });

  test("edge card has only 3 neighbors", () => {
    // Position 1 (top edge) has 3 neighbors: 0 (left/right), 2 (right/left), 4 (bottom/top)
    // Place opponent cards at all 3, then capture from pos 1
    const opCard0 = createCard(1, 2, 1, 1); // at pos 0, right=2 (defends against pos 1's left)
    const opCard2 = createCard(1, 1, 1, 2); // at pos 2, left=2 (defends against pos 1's right)
    const opCard4 = createCard(2, 1, 1, 1); // at pos 4, top=2 (defends against pos 1's bottom)
    const pCard = createCard(1, 5, 5, 5);   // at pos 1, left=5 > 2, right=5 > 2, bottom=5 > 2

    const state = createInitialState(
      [filler, filler, filler, pCard, filler],
      [opCard0, opCard2, opCard4, filler, filler],
    );

    // Turn 1: Player at pos 8
    let s = placeCard(state, filler, 8);
    // Turn 2: Opponent at pos 0
    s = placeCard(s, opCard0, 0);
    // Turn 3: Player at pos 6
    s = placeCard(s, filler, 6);
    // Turn 4: Opponent at pos 2
    s = placeCard(s, opCard2, 2);
    // Turn 5: Player at pos 7
    s = placeCard(s, filler, 7);
    // Turn 6: Opponent at pos 4
    s = placeCard(s, opCard4, 4);
    // Turn 7: Player places pCard at pos 1 (top edge)
    s = placeCard(s, pCard, 1);

    // All 3 neighbors captured via standard capture
    expect(s.board[0]!.owner).toBe(Owner.Player);
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[2]!.owner).toBe(Owner.Player);
    expect(s.board[4]!.owner).toBe(Owner.Player);
  });
});

describe("full game", () => {
  test("plays a complete 9-turn game with correct scoring", () => {
    // All player cards: (5,5,5,5), all opponent cards: (3,3,3,3)
    // Placement order: positions 0-8 in sequence, alternating P/O
    const p = createCard(5, 5, 5, 5);
    const o = createCard(3, 3, 3, 3);

    const state = createInitialState([p, p, p, p, p], [o, o, o, o, o], Owner.Player, { plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false });

    // Turn 1 (P): pos 0. No occupied neighbors.
    let s = placeCard(state, p, 0);

    // Turn 2 (O): pos 1. Neighbor: 0(P). 1 neighbor, no Plus/Same.
    // Standard: o.left=3 vs p.right=5 → no capture.
    s = placeCard(s, o, 1);

    // Turn 3 (P): pos 2. Neighbor: 1(O). 1 neighbor.
    // Standard: p.left=5 vs o.right=3 → captures pos 1.
    s = placeCard(s, p, 2);
    expect(s.board[1]!.owner).toBe(Owner.Player);

    // Turn 4 (O): pos 3. Neighbor: 0(P). 1 neighbor.
    // Standard: o.top=3 vs p.bottom=5 → no capture.
    s = placeCard(s, o, 3);

    // Turn 5 (P): pos 4. Neighbors: 1(P), 3(O).
    // Plus: 5+3=8 (top+pos1.bottom), 5+3=8 (left+pos3.right). Same sum → Plus triggers!
    // pos 1 is Player → skip. pos 3 is Opponent → flip to Player.
    // Combo from pos 3 (card 3,3,3,3): neighbor 0(P) → 3>5? No. No combo captures.
    s = placeCard(s, p, 4);
    expect(s.board[3]!.owner).toBe(Owner.Player);

    // Board: [P, P, P, P, P, _, _, _, _] — Player owns all 5

    // Turn 6 (O): pos 5. Neighbors: 2(P, card 5,5,5,5), 4(P, card 5,5,5,5).
    // Plus: 3+5=8 (top+pos2.bottom), 3+5=8 (left+pos4.right). Plus triggers!
    // pos 2 → Opponent, pos 4 → Opponent.
    // Combo from pos 2 (card 5,5,5,5, now O): neighbor 1(P, card 3,3,3,3). 5>3 → flip pos 1 → O.
    // Combo from pos 4 (card 5,5,5,5, now O): neighbor 1(now O), neighbor 3(P, card 3,3,3,3). 5>3 → flip pos 3 → O.
    // Combo from pos 1 (card 3,3,3,3, now O): neighbor 0(P, card 5,5,5,5). 3>5? No.
    // Combo from pos 3 (card 3,3,3,3, now O): neighbor 0(P, card 5,5,5,5). 3>5? No.
    s = placeCard(s, o, 5);
    expect(s.board[2]!.owner).toBe(Owner.Opponent);
    expect(s.board[4]!.owner).toBe(Owner.Opponent);
    expect(s.board[1]!.owner).toBe(Owner.Opponent);
    expect(s.board[3]!.owner).toBe(Owner.Opponent);

    // Board: [P, O, O, O, O, O, _, _, _]

    // Turn 7 (P): pos 6. Neighbor: 3(O, card 3,3,3,3). 1 neighbor.
    // Standard: p.top=5 vs o.bottom=3 → captures pos 3.
    s = placeCard(s, p, 6);
    expect(s.board[3]!.owner).toBe(Owner.Player);

    // Board: [P, O, O, P, O, O, P, _, _]

    // Turn 8 (O): pos 7. Neighbors: 6(P, card 5,5,5,5), 4(O, card 5,5,5,5).
    // Plus: 3+5=8 (left+pos6.right), 3+5=8 (top+pos4.bottom). Plus triggers!
    // pos 6 is Player → flip to O. pos 4 is Opponent → skip.
    // Combo from pos 6 (card 5,5,5,5, now O): neighbor 3(P, card 3,3,3,3). 5>3 → flip pos 3 → O.
    // Combo from pos 3 (card 3,3,3,3, now O): neighbor 0(P, card 5,5,5,5). 3>5? No.
    s = placeCard(s, o, 7);
    expect(s.board[6]!.owner).toBe(Owner.Opponent);
    expect(s.board[3]!.owner).toBe(Owner.Opponent);

    // Board: [P, O, O, O, O, O, O, O, _]

    // Turn 9 (P): pos 8. Neighbors: 7(O, card 3,3,3,3), 5(O, card 3,3,3,3).
    // Plus: 5+3=8 (left+pos7.right), 5+3=8 (top+pos5.bottom). Plus triggers!
    // pos 7 → Player, pos 5 → Player.
    // Combo from pos 7 (card 3,3,3,3, now P): neighbors 6(O, card 5,5,5,5). 3>5? No.
    //   neighbor 4(O, card 5,5,5,5). 3>5? No.
    // Combo from pos 5 (card 3,3,3,3, now P): neighbors 2(O, card 5,5,5,5). 3>5? No.
    //   neighbor 4(O, card 5,5,5,5). 3>5? No.
    s = placeCard(s, p, 8);
    expect(s.board[7]!.owner).toBe(Owner.Player);
    expect(s.board[5]!.owner).toBe(Owner.Player);

    // Final board: [P, O, O, O, O, P, O, P, P]
    // Player owns: 0, 5, 7, 8 = 4 on board + 0 in hand = 4

    // Wait, let me recount. Hmm, I had pos 5 flipped to Player at turn 9.
    // pos 0: P (never lost)
    // pos 1: O (flipped at turn 6)
    // pos 2: O (flipped at turn 6)
    // pos 3: O (flipped at turn 8)
    // pos 4: O (flipped at turn 6)
    // pos 5: P (flipped at turn 9)
    // pos 6: O (flipped at turn 8)
    // pos 7: P (flipped at turn 9)
    // pos 8: P (placed by player)

    // All 9 positions filled
    for (let i = 0; i < 9; i++) {
      expect(s.board[i]).not.toBeNull();
    }

    // Player used all 5 cards, opponent used 4 (second player gets fewer turns)
    expect(s.playerHand).toHaveLength(0);
    expect(s.opponentHand).toHaveLength(1);

    // Score includes hand cards: player=0+4=4, opponent=1+5=6, total=10
    const score = getScore(s);
    expect(score.player + score.opponent).toBe(10);
    expect(score.player).toBe(4);
    expect(score.opponent).toBe(6);
  });
});

describe("getScore", () => {
  test("counts cards on board and in hand for each player", () => {
    const card = createCard(1, 1, 1, 1);
    // 2 player on board (pos 0, 2), 1 opponent on board (pos 1), rest empty
    const board = [
      { card, owner: Owner.Player   },  // 0
      { card, owner: Owner.Opponent },  // 1
      { card, owner: Owner.Player   },  // 2
      null, null, null, null, null, null,
    ] as Board;
    const state: GameState = {
      board,
      playerHand:   [card, card],        // 2 in hand
      opponentHand: [card, card, card],  // 3 in hand
      currentTurn: Owner.Player,
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    };

    const score = getScore(state);
    expect(score.player).toBe(4);    // 2 on board + 2 in hand
    expect(score.opponent).toBe(4);  // 1 on board + 3 in hand
    expect(score.player + score.opponent).toBe(8); // total cards in game (3 on board + 5 in hand)
  });
});

describe("combined rules", () => {
  test("Plus and Same both trigger on a single placement, flipping disjoint sets of cards", () => {
    // pCard at pos 4 (center):
    //   Same: pCard.top(3)=oCard1.bottom(3), pCard.right(7)=oCard5.left(7) → 2 same pairs → flip pos1, pos5
    //   Plus: pCard.left(2)+oCard3.right(8)=10, pCard.bottom(4)+oCard7.top(6)=10 → 2 plus pairs → flip pos3, pos7
    //   Same sums (6, 14) never equal the Plus sum (10), so the two rules flip separate cards.
    const pCard  = createCard(3, 7, 4, 2);
    const oCard1 = createCard(1, 1, 3, 1);  // pos 1: bottom=3 (Same pair with pCard.top)
    const oCard3 = createCard(1, 8, 1, 1);  // pos 3: right=8  (Plus pair: 2+8=10)
    const oCard5 = createCard(1, 1, 1, 7);  // pos 5: left=7   (Same pair with pCard.right)
    const oCard7 = createCard(6, 1, 1, 1);  // pos 7: top=6    (Plus pair: 4+6=10)

    // Board layout: only the 4 opponent cards and the empty center (pos 4).
    // All other positions empty so combo cascades have no targets.
    const board = [
      null,
      { card: oCard1, owner: Owner.Opponent },  // 1
      null,
      { card: oCard3, owner: Owner.Opponent },  // 3
      null,                                      // 4 (player places here)
      { card: oCard5, owner: Owner.Opponent },  // 5
      null,
      { card: oCard7, owner: Owner.Opponent },  // 7
      null,
    ] as Board;

    const state: GameState = {
      board,
      playerHand:   [pCard],
      opponentHand: [],
      currentTurn: Owner.Player,
      rules: { plus: true, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
    };

    const s = placeCard(state, pCard, 4);

    expect(s.board[1]!.owner).toBe(Owner.Player);  // flipped by Same
    expect(s.board[5]!.owner).toBe(Owner.Player);  // flipped by Same
    expect(s.board[3]!.owner).toBe(Owner.Player);  // flipped by Plus
    expect(s.board[7]!.owner).toBe(Owner.Player);  // flipped by Plus
  });
});

describe("combo cascade depth", () => {
  test("combo chain of depth 2: Same flips A, A captures B, B captures C", () => {
    // pCard at pos 4 triggers Same on pos1 and pos7 (same values).
    // Combo from pos7: oCard7.left(9) > oCard6.right(1) → pos6 flips (depth 1).
    // Combo from pos6: oCard6.top(8) > oCard3.bottom(1) → pos3 flips (depth 2).
    // pos1 combo: all neighbors are empty, no further captures.
    const pCard  = createCard(5, 1, 5, 1);  // top=5, bottom=5 (Same pairs)
    const oCard1 = createCard(1, 1, 5, 1);  // pos 1: bottom=5 (Same), weak elsewhere
    const oCard3 = createCard(1, 1, 1, 1);  // pos 3: bottom=1 (depth-2 combo target)
    const oCard6 = createCard(8, 1, 1, 1);  // pos 6: top=8 (captures pos3), right=1 (captured by pos7)
    const oCard7 = createCard(5, 1, 1, 9);  // pos 7: top=5 (Same), left=9 (captures pos6)

    const board = [
      null,
      { card: oCard1, owner: Owner.Opponent },  // 1
      null,
      { card: oCard3, owner: Owner.Opponent },  // 3
      null,                                      // 4 (player places here)
      null,
      { card: oCard6, owner: Owner.Opponent },  // 6
      { card: oCard7, owner: Owner.Opponent },  // 7
      null,
    ] as Board;

    const state: GameState = {
      board,
      playerHand:   [pCard],
      opponentHand: [],
      currentTurn: Owner.Player,
      rules: { plus: false, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
    };

    const s = placeCard(state, pCard, 4);

    // Same flips pos1 and pos7
    expect(s.board[1]!.owner).toBe(Owner.Player);
    expect(s.board[7]!.owner).toBe(Owner.Player);
    // Combo depth 1: pos7.left(9) > pos6.right(1)
    expect(s.board[6]!.owner).toBe(Owner.Player);
    // Combo depth 2: pos6.top(8) > pos3.bottom(1)
    expect(s.board[3]!.owner).toBe(Owner.Player);
  });
});
