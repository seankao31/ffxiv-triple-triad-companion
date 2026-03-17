// ABOUTME: Verifies the TypeScript solver matches the expected output in JSON solver fixtures.
// ABOUTME: Fixtures are shared with the Rust tests for cross-engine verification.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "../../src/engine/types";
import type { Outcome } from "../../src/engine/types";
import { findBestMove } from "../../src/engine/solver";

const FIXTURES_DIR = join(import.meta.dir, "../../tests/fixtures/solver");

interface ExpectedMove {
  cardId: number;
  position: number;
  outcome: Outcome;
  robustness: number;
}

interface Fixture {
  name: string;
  state: GameState;
  expected: ExpectedMove[];
}

describe("solver fixtures", () => {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    it(file.replace(".json", ""), () => {
      const fixture: Fixture = JSON.parse(
        readFileSync(join(FIXTURES_DIR, file), "utf-8"),
      );

      const result = findBestMove(fixture.state);

      expect(result.length).toBe(fixture.expected.length);

      for (let i = 0; i < fixture.expected.length; i++) {
        const got = result[i]!;
        const exp = fixture.expected[i]!;
        expect(got.card.id).toBe(exp.cardId);
        expect(got.position).toBe(exp.position);
        expect(got.outcome).toBe(exp.outcome);
        expect(Math.abs(got.robustness - exp.robustness)).toBeLessThan(1e-9);
      }
    });
  }
});
