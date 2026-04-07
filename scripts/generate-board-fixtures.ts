// ABOUTME: Generates JSON test fixtures for board capture rules from the TypeScript engine.
// ABOUTME: Each fixture captures a pre-computed game state plus the result of one placeCard call.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  type Card,
  type GameState,
  type RuleSet,
  type Board,
  CardType,
  Owner,
  createCard,
  createInitialState,
  resetCardIds,
} from "../src/engine/types";
import { placeCard } from "../src/engine/board";

const OUT_DIR = join(import.meta.dir, "../tests/fixtures/board");
mkdirSync(OUT_DIR, { recursive: true });

function writeFixture(
  name: string,
  state: GameState,
  cardId: number,
  position: number,
): void {
  const hand =
    state.currentTurn === Owner.Player
      ? state.playerHand
      : state.opponentHand;
  const card = hand.find((c) => c != null && c.id === cardId);
  if (!card) throw new Error(`Card id ${cardId} not found in hand for fixture '${name}'`);
  const expected = placeCard(state, card, position);
  const fixture = { name, state, cardId, position, expected };
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(fixture, null, 2));
  console.log(`✓ ${name}`);
}

function setup(initialState: GameState, moves: [Card, number][]): GameState {
  let state = initialState;
  for (const [card, pos] of moves) {
    const hand =
      state.currentTurn === Owner.Player
        ? state.playerHand
        : state.opponentHand;
    const c = hand.find((h) => h != null && h.id === card.id);
    if (!c) throw new Error(`Card id ${card.id} not found in hand during setup`);
    state = placeCard(state, c, pos);
  }
  return state;
}

const noRules: RuleSet = {
  plus: false,
  same: false,
  reverse: false,
  fallenAce: false,
  ascension: false,
  descension: false,
  order: false,
  chaos: false,
};
const sameRules: RuleSet = { ...noRules, same: true };
const plusRules: RuleSet = { ...noRules, plus: true };
const reverseRules: RuleSet = { ...noRules, reverse: true };
const faRules: RuleSet = { ...noRules, fallenAce: true };
const ascRules: RuleSet = { ...noRules, ascension: true };
const descRules: RuleSet = { ...noRules, descension: true };

// --- Same rule ---

// 1. same_basic_two_pairs
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const opCard1 = createCard(1, 1, 5, 1);
  const opCard2 = createCard(1, 7, 1, 1);
  const pCard = createCard(5, 1, 1, 7);
  const state = setup(
    createInitialState([filler, filler, pCard, filler, filler], [opCard1, opCard2, filler, filler, filler], Owner.Player, sameRules),
    [[filler, 8], [opCard1, 1], [filler, 6], [opCard2, 3]],
  );
  writeFixture("same_basic_two_pairs", state, pCard.id, 4);
}

// 2. same_one_pair_no_trigger
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const opCard1 = createCard(1, 1, 5, 1);
  const opCard2 = createCard(1, 9, 1, 1);
  const pCard = createCard(5, 1, 1, 7);
  const state = setup(
    createInitialState([filler, filler, pCard, filler, filler], [opCard1, opCard2, filler, filler, filler], Owner.Player, sameRules),
    [[filler, 8], [opCard1, 1], [filler, 6], [opCard2, 3]],
  );
  writeFixture("same_one_pair_no_trigger", state, pCard.id, 4);
}

// 3. same_friendly_counts_not_flipped
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const pCard1 = createCard(1, 1, 5, 1);
  const opCard = createCard(1, 7, 1, 1);
  const pCard2 = createCard(5, 1, 1, 7);
  const state = setup(
    createInitialState([pCard1, filler, pCard2, filler, filler], [opCard, filler, filler, filler, filler], Owner.Player, sameRules),
    [[pCard1, 1], [opCard, 3], [filler, 8], [filler, 6]],
  );
  writeFixture("same_friendly_counts_not_flipped", state, pCard2.id, 4);
}

// --- Plus rule ---

// 4. plus_basic_equal_sums
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const opCard1 = createCard(1, 1, 5, 1);
  const opCard2 = createCard(1, 7, 1, 1);
  const pCard = createCard(3, 1, 1, 1);
  const state = setup(
    createInitialState([filler, filler, pCard, filler, filler], [opCard1, opCard2, filler, filler, filler], Owner.Player, plusRules),
    [[filler, 8], [opCard1, 1], [filler, 6], [opCard2, 3]],
  );
  writeFixture("plus_basic_equal_sums", state, pCard.id, 4);
}

// 5. plus_one_pair_no_trigger
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const opCard = createCard(1, 1, 5, 1);
  const pCard = createCard(3, 1, 1, 1);
  const state = setup(
    createInitialState([filler, filler, pCard, filler, filler], [opCard, filler, filler, filler, filler], Owner.Player, plusRules),
    [[filler, 8], [opCard, 1]],
  );
  writeFixture("plus_one_pair_no_trigger", state, pCard.id, 4);
}

// 6. plus_friendly_counts_not_flipped
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const pCard1 = createCard(1, 1, 5, 1);
  const opCard = createCard(1, 7, 1, 1);
  const pCard2 = createCard(3, 1, 1, 1);
  const state = setup(
    createInitialState([pCard1, filler, pCard2, filler, filler], [opCard, filler, filler, filler, filler], Owner.Player, plusRules),
    [[pCard1, 1], [opCard, 3], [filler, 8], [filler, 6]],
  );
  writeFixture("plus_friendly_counts_not_flipped", state, pCard2.id, 4);
}

// --- Combo cascade ---

// 7. combo_same_triggers_standard_capture
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const opp0 = createCard(1, 1, 1, 1);
  const opp1 = createCard(1, 1, 7, 9);
  const opp3 = createCard(1, 3, 1, 1);
  const plr4 = createCard(7, 1, 1, 3);
  const state = setup(
    createInitialState([filler, filler, plr4, filler, filler], [opp0, opp1, opp3, filler, filler], Owner.Player, sameRules),
    [[filler, 8], [opp0, 0], [filler, 6], [opp1, 1], [filler, 2], [opp3, 3]],
  );
  writeFixture("combo_same_triggers_standard_capture", state, plr4.id, 4);
}

// 8. combo_does_not_retrigger_same
resetCardIds();
{
  const filler = createCard(1, 1, 1, 1);
  const opp0 = createCard(5, 5, 5, 5);
  const opp1 = createCard(1, 1, 7, 5);
  const opp3 = createCard(1, 3, 1, 1);
  const plr4 = createCard(7, 1, 1, 3);
  const state = setup(
    createInitialState([filler, filler, plr4, filler, filler], [opp0, opp1, opp3, filler, filler], Owner.Player, sameRules),
    [[filler, 8], [opp0, 0], [filler, 6], [opp1, 1], [filler, 2], [opp3, 3]],
  );
  writeFixture("combo_does_not_retrigger_same", state, plr4.id, 4);
}

// --- Reverse rule ---

// 9. reverse_higher_does_not_capture
resetCardIds();
{
  const pCards = [
    createCard(7, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 5, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, reverseRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("reverse_higher_does_not_capture", state, pCards[0]!.id, 3);
}

// 10. reverse_lower_captures
resetCardIds();
{
  const pCards = [
    createCard(3, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 7, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, reverseRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("reverse_lower_captures", state, pCards[0]!.id, 3);
}

// --- Fallen Ace rule ---

// 11. fallen_ace_ten_captures_one
resetCardIds();
{
  const pCards = [
    createCard(10, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, faRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("fallen_ace_ten_captures_one", state, pCards[0]!.id, 3);
}

// 12. fallen_ace_one_captures_ten
resetCardIds();
{
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 10, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, faRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("fallen_ace_one_captures_ten", state, pCards[0]!.id, 3);
}

// 13. fallen_ace_normal_capture_works
resetCardIds();
{
  const pCards = [
    createCard(7, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 5, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, faRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("fallen_ace_normal_capture_works", state, pCards[0]!.id, 3);
}

// 14. fallen_ace_reverse_ten_captures_one
resetCardIds();
{
  const faRevRules: RuleSet = { ...noRules, fallenAce: true, reverse: true };
  const pCards = [
    createCard(10, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, faRevRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("fallen_ace_reverse_ten_captures_one", state, pCards[0]!.id, 3);
}

// 15. fallen_ace_reverse_one_captures_ten
resetCardIds();
{
  const faRevRules: RuleSet = { ...noRules, fallenAce: true, reverse: true };
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 10, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, faRevRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("fallen_ace_reverse_one_captures_ten", state, pCards[0]!.id, 3);
}

// --- Ascension rule ---

// 16. ascension_boosts_attacking_primal
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 5, 1),
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(5, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, ascRules),
    [[oCards[1]!, 2], [pCards[0]!, 8], [oCards[0]!, 0]],
  );
  writeFixture("ascension_boosts_attacking_primal", state, pCards[1]!.id, 3);
}

// 17. ascension_boosts_defending_primal
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 6, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(7, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, ascRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("ascension_boosts_defending_primal", state, pCards[0]!.id, 3);
}

// 18. ascension_no_effect_non_primal
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 5, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(5, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, ascRules),
    [[oCards[0]!, 0], [pCards[0]!, 6], [oCards[1]!, 1]],
  );
  writeFixture("ascension_no_effect_non_primal", state, pCards[1]!.id, 4);
}

// 19. ascension_caps_at_10
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 10, 1),
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(9, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, ascRules),
    [[oCards[0]!, 0], [pCards[0]!, 6], [oCards[1]!, 1], [pCards[1]!, 8], [oCards[2]!, 2]],
  );
  writeFixture("ascension_caps_at_10", state, pCards[2]!.id, 4);
}

// 20. ascension_placed_card_excludes_itself
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 5, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(5, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, ascRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("ascension_placed_card_excludes_itself", state, pCards[0]!.id, 3);
}

// 21. ascension_applies_to_same_rule
resetCardIds();
{
  const ascSameRules: RuleSet = { ...ascRules, same: true };
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 5, 1),
    createCard(1, 4, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(4, 1, 1, 3, CardType.Primal),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, ascSameRules),
    [[oCards[0]!, 0], [pCards[0]!, 6], [oCards[1]!, 1], [pCards[1]!, 8], [oCards[2]!, 3]],
  );
  writeFixture("ascension_applies_to_same_rule", state, pCards[2]!.id, 4);
}

// --- Descension rule ---

// 22. descension_penalizes_attacking_scion
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 5, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(6, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, descRules),
    [[oCards[0]!, 2], [pCards[0]!, 6], [oCards[1]!, 0]],
  );
  writeFixture("descension_penalizes_attacking_scion", state, pCards[1]!.id, 3);
}

// 23. descension_penalizes_defending_scion
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 7, 1, CardType.Scion),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(7, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, descRules),
    [[oCards[0]!, 2], [pCards[0]!, 6], [oCards[1]!, 0]],
  );
  writeFixture("descension_penalizes_defending_scion", state, pCards[1]!.id, 3);
}

// 24. descension_no_effect_non_scion
resetCardIds();
{
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 4, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1),
    createCard(5, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, descRules),
    [[oCards[0]!, 0], [pCards[0]!, 6], [oCards[1]!, 1]],
  );
  writeFixture("descension_no_effect_non_scion", state, pCards[1]!.id, 4);
}

// --- Mutation-discovered boundary cases ---

// 25. reverse_equal_does_not_capture (M2)
resetCardIds();
{
  // Equal values must NOT capture under Reverse (strictly less-than required).
  // Player top=5 vs opp bottom=5. Reverse: 5<5 → false → no capture.
  const pCards = [
    createCard(5, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const oCards = [
    createCard(1, 1, 5, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, reverseRules),
    [[oCards[0]!, 0]],
  );
  writeFixture("reverse_equal_does_not_capture", state, pCards[0]!.id, 3);
}

// 26. ascension_cap_asymmetric_capture (M6)
resetCardIds();
{
  // Asymmetric cap test: only attacker hits cap=10, defender stays below.
  // 3 Primal fillers on board. Player Primal top=8 (+3 → min(10,11)=10).
  // Opp Society bottom=8, 1 Society on board (itself) → 8+1=9.
  // With cap=10: 10>9 → capture. With cap=9: 9>9 → no capture (mutation leaks).
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 8, 1, CardType.Society),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(8, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, ascRules),
    [
      [oCards[0]!, 2], [pCards[0]!, 6],
      [oCards[1]!, 5], [pCards[1]!, 7],
      [oCards[2]!, 8], [pCards[2]!, 4],
      [oCards[3]!, 0],
    ],
  );
  writeFixture("ascension_cap_asymmetric_capture", state, pCards[3]!.id, 3);
}

// 27. descension_floor_at_one (M7)
resetCardIds();
{
  // Floor test: defender value pushed below 1 gets floored at 1.
  // 3 Scions on board. Opp Scion bottom=2 (-3 → max(1,-1)=1).
  // Player Garlean top=1 (0 Garleans on board → 1-0=1). 1>1? No → no capture.
  // If floor=0: max(0,-1)=0, 1>0 → capture (mutation leaks).
  const oCards = [
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 1, 1, CardType.Scion),
    createCard(1, 1, 2, 1, CardType.Scion),
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1),
  ];
  const pCards = [
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1, CardType.Primal),
    createCard(1, 1, 1, 1, CardType.Garlean),
    createCard(1, 1, 1, 1),
  ];
  const state = setup(
    createInitialState(pCards, oCards, Owner.Opponent, descRules),
    [
      [oCards[0]!, 2], [pCards[0]!, 6],
      [oCards[1]!, 5], [pCards[1]!, 7],
      [oCards[2]!, 0], [pCards[2]!, 8],
      [oCards[3]!, 4],
    ],
  );
  writeFixture("descension_floor_at_one", state, pCards[3]!.id, 3);
}

// --- Combined rules ---

// 28. combined_plus_and_same_simultaneous
resetCardIds();
{
  const pCard = createCard(3, 7, 4, 2);
  const oCard1 = createCard(1, 1, 3, 1);
  const oCard3 = createCard(1, 8, 1, 1);
  const oCard5 = createCard(1, 1, 1, 7);
  const oCard7 = createCard(6, 1, 1, 1);
  const board: Board = [
    null,
    { card: oCard1, owner: Owner.Opponent },
    null,
    { card: oCard3, owner: Owner.Opponent },
    null,
    { card: oCard5, owner: Owner.Opponent },
    null,
    { card: oCard7, owner: Owner.Opponent },
    null,
  ];
  const state: GameState = {
    board,
    playerHand: [pCard],
    opponentHand: [],
    currentTurn: Owner.Player,
    rules: { plus: true, same: true, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
    forcedCardId: null,
  };
  writeFixture("combined_plus_and_same_simultaneous", state, pCard.id, 4);
}

// 29. combo_depth_2_chain
resetCardIds();
{
  const pCard = createCard(5, 1, 5, 1);
  const oCard1 = createCard(1, 1, 5, 1);
  const oCard3 = createCard(1, 1, 1, 1);
  const oCard6 = createCard(8, 1, 1, 1);
  const oCard7 = createCard(5, 1, 1, 9);
  const board: Board = [
    null,
    { card: oCard1, owner: Owner.Opponent },
    null,
    { card: oCard3, owner: Owner.Opponent },
    null,
    null,
    { card: oCard6, owner: Owner.Opponent },
    { card: oCard7, owner: Owner.Opponent },
    null,
  ];
  const state: GameState = {
    board,
    playerHand: [pCard],
    opponentHand: [],
    currentTurn: Owner.Player,
    rules: { plus: false, same: true, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
    forcedCardId: null,
  };
  writeFixture("combo_depth_2_chain", state, pCard.id, 4);
}

// --- Order rule ---
const orderRules: RuleSet = { ...noRules, order: true };

// 30. order_basic_placement (card at index 0 placed successfully, no captures)
resetCardIds();
{
  const p = [createCard(7, 3, 5, 2), createCard(4, 8, 1, 6), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
  const o = [createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(1,1,1,1), createCard(1,1,1,1), createCard(1,1,1,1)];
  const state = createInitialState(p, o, Owner.Player, orderRules);
  writeFixture("order_basic_placement", state, p[0]!.id, 4);
}

// 31. order_with_standard_capture (Order + normal capture)
resetCardIds();
{
  const pCard = createCard(1, 1, 1, 9);
  const oWeak = createCard(2, 2, 2, 2);
  const oFiller = createCard(3, 3, 3, 3);
  const p = [pCard, createCard(1, 1, 1, 1), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1)];
  const o = [oWeak, oFiller, createCard(1, 1, 1, 1), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1)];
  // Opponent goes first, places weak card at position 3
  const stateOppFirst = createInitialState(p, o, Owner.Opponent, orderRules);
  const afterOpp = setup(stateOppFirst, [[oWeak, 3]]);
  // Player plays p[0] (left=9) at position 4. Attacks position 3's right=2. 9>2 → capture.
  writeFixture("order_with_standard_capture", afterOpp, pCard.id, 4);
}

// 32. order_with_plus (Order + Plus rule active)
resetCardIds();
{
  const orderPlusRules: RuleSet = { ...noRules, order: true, plus: true };
  const oCard1 = createCard(1, 1, 5, 1);
  const oCard2 = createCard(1, 7, 1, 1);
  const pCard = createCard(3, 1, 1, 1);
  // With Order rule, fillers that are played in setup must be at the front of the hand.
  // Two player fillers are played during setup (positions 8 and 6), so they go first.
  const pFill1 = createCard(1, 1, 1, 1);
  const pFill2 = createCard(1, 1, 1, 1);
  const p = [pFill1, pFill2, pCard, createCard(1, 1, 1, 1), createCard(1, 1, 1, 1)];
  const o = [oCard1, oCard2, createCard(1, 1, 1, 1), createCard(1, 1, 1, 1), createCard(1, 1, 1, 1)];
  const state = setup(
    createInitialState(p, o, Owner.Player, orderPlusRules),
    [[pFill1, 8], [oCard1, 1], [pFill2, 6], [oCard2, 3]],
  );
  // pCard is now at index 0 of remaining player hand. Place at position 4.
  // top(3)+bottom(5)=8, left(1)+right(7)=8 → Plus triggers on both.
  writeFixture("order_with_plus", state, pCard.id, 4);
}

console.log("\nDone.");
