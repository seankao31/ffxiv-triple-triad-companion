// ABOUTME: Verifies the TypeScript engine matches the expected output in JSON board fixtures.
// ABOUTME: Fixtures are shared with the Rust tests for cross-engine verification.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "../../src/engine/types";
import { Owner } from "../../src/engine/types";
import { placeCard } from "../../src/engine/board";

const FIXTURES_DIR = join(import.meta.dir, "../../tests/fixtures/board");

interface Fixture {
  name: string;
  state: GameState;
  cardId: number;
  position: number;
  expected: GameState;
}

describe("board fixtures", () => {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    it(file.replace(".json", ""), () => {
      const fixture: Fixture = JSON.parse(
        readFileSync(join(FIXTURES_DIR, file), "utf-8"),
      );
      const hand =
        fixture.state.currentTurn === Owner.Player
          ? fixture.state.playerHand
          : fixture.state.opponentHand;
      const card = hand.find((c) => c != null && c.id === fixture.cardId)!;
      const result = placeCard(fixture.state, card, fixture.position);
      expect(result).toEqual(fixture.expected);
    });
  }
});
