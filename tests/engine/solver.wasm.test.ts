// ABOUTME: Verifies the WASM solver produces correct output matching the solver JSON fixtures.
// ABOUTME: Requires the WASM build to be present at engine-rs/pkg/ (run wasm-pack build first).

import { describe, expect, it, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PKG_DIR = join(import.meta.dir, '../../engine-rs/pkg');
const FIXTURES_DIR = join(import.meta.dir, '../../tests/fixtures/solver');

interface ExpectedMove {
  cardId: number;
  position: number;
  outcome: string;
  robustness: number;
}

interface Fixture {
  name: string;
  state: unknown;
  expected: ExpectedMove[];
}

let wasm_solve: (state_json: string) => string;
let wasm_simulate: (state_json: string) => string;

describe('WASM solver', () => {
  beforeAll(async () => {
    // Use engine_rs.js (web target) with initSync — works in Bun without a bundler.
    // initSync loads WASM from raw bytes synchronously; no fetch() needed.
    const pkg = await import(`file://${join(PKG_DIR, 'engine_rs.js')}`);
    const wasmBytes = readFileSync(join(PKG_DIR, 'engine_rs_bg.wasm'));
    pkg.initSync({ module: wasmBytes });
    wasm_solve = pkg.wasm_solve;
    wasm_simulate = pkg.wasm_simulate;
  });

  const files = readdirSync(FIXTURES_DIR)
    .filter((f: string) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    it(file.replace('.json', ''), () => {
      const fixture: Fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));
      const resultJson = wasm_solve(JSON.stringify(fixture.state));
      const result: Array<{ card: { id: number }; position: number; outcome: string; robustness: number }> = JSON.parse(resultJson);

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

  it('PIMC benchmark — 50 simulations with real distinct cards', async () => {
    const state = {
      board: [null, null, null, null, null, null, null, null, null],
      playerHand: [
        { id: 0, top: 4, right: 8, bottom: 8, left: 1, type: 'none' },
        { id: 1, top: 1, right: 4, bottom: 8, left: 8, type: 'none' },
        { id: 2, top: 8, right: 2, bottom: 8, left: 10, type: 'none' },
        { id: 3, top: 8, right: 2, bottom: 3, left: 8, type: 'none' },
        { id: 4, top: 2, right: 5, bottom: 9, left: 9, type: 'none' },
      ],
      opponentHand: [
        { id: 5, top: 3, right: 7, bottom: 5, left: 2, type: 'none' },
        { id: 6, top: 8, right: 3, bottom: 9, left: 6, type: 'none' },
        { id: 7, top: 1, right: 5, bottom: 8, left: 4, type: 'none' },
        { id: 8, top: 6, right: 9, bottom: 1, left: 7, type: 'none' },
        { id: 9, top: 3, right: 2, bottom: 4, left: 10, type: 'none' },
      ],
      currentTurn: 'player',
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    };
    const stateJson = JSON.stringify(state);

    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      const result = wasm_simulate(stateJson);
      const move: unknown = JSON.parse(result);
      expect(move).not.toBeNull();
    }
    const totalMs = performance.now() - t0;
    const perSimMs = totalMs / 50;

    console.log(`PIMC benchmark: 50 sims in ${totalMs.toFixed(1)}ms (${perSimMs.toFixed(1)}ms/sim)`);
    // No upper-bound assertion — this is a recording checkpoint
  }, 600_000);
});
