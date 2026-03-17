// ABOUTME: Generates JSON test fixtures for the solver from the TypeScript engine.
// ABOUTME: Each fixture captures a pre-computed game state plus the expected ranked moves.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  type GameState,
  Owner,
  createCard,
  createInitialState,
  resetCardIds,
} from "../src/engine/types";
import { placeCard } from "../src/engine/board";
import { findBestMove } from "../src/engine/solver";

const OUT_DIR = join(import.meta.dir, "../tests/fixtures/solver");
mkdirSync(OUT_DIR, { recursive: true });

function writeFixture(name: string, state: GameState): void {
  const moves = findBestMove(state);
  const expected = moves.map((m) => ({
    cardId: m.card.id,
    position: m.position,
    outcome: m.outcome,
    robustness: m.robustness,
  }));
  const fixture = { name, state, expected };
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(fixture, null, 2));
  console.log(`✓ ${name} (${moves.length} moves)`);
}

// 1. solver_full_board — full board, no moves expected
resetCardIds();
{
  const p = [
    createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3),
    createCard(4,4,4,4), createCard(5,5,5,5),
  ];
  const o = [
    createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8),
    createCard(9,9,9,9), createCard(10,10,10,10),
  ];
  let state = createInitialState(p, o);
  state = placeCard(state, p[0]!, 0);
  state = placeCard(state, o[0]!, 2);
  state = placeCard(state, p[1]!, 6);
  state = placeCard(state, o[1]!, 8);
  state = placeCard(state, p[2]!, 4);
  state = placeCard(state, o[2]!, 1);
  state = placeCard(state, p[3]!, 3);
  state = placeCard(state, o[3]!, 7);
  state = placeCard(state, p[4]!, 5);
  writeFixture("solver_full_board", state);
}

// 2. solver_late_game_win — 8 cells filled, 1 card, forced win at position 4
resetCardIds();
{
  const p = [
    createCard(10,10,10,10), createCard(1,1,1,1), createCard(2,2,2,2),
    createCard(3,3,3,3),     createCard(4,4,4,4),
  ];
  const o = [
    createCard(1,1,1,1), createCard(5,5,5,5), createCard(6,6,6,6),
    createCard(7,7,7,7), createCard(8,8,8,8),
  ];
  let state = createInitialState(p, o);
  state = placeCard(state, p[1]!, 0);
  state = placeCard(state, o[0]!, 1);
  state = placeCard(state, p[2]!, 2);
  state = placeCard(state, o[1]!, 3);
  state = placeCard(state, p[3]!, 5);
  state = placeCard(state, o[2]!, 6);
  state = placeCard(state, p[4]!, 7);
  state = placeCard(state, o[3]!, 8);
  writeFixture("solver_late_game_win", state);
}

// 3. solver_opponent_first — opponent has all-10, player has all-1; opponent moves first
//    All opponent moves should be Win from opponent's perspective.
resetCardIds();
{
  const p = Array.from({ length: 5 }, () => createCard(1,1,1,1));
  const o = Array.from({ length: 5 }, () => createCard(10,10,10,10));
  const state = createInitialState(p, o, Owner.Opponent);
  writeFixture("solver_opponent_first", state);
}

console.log("\nDone.");
