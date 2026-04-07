// ABOUTME: On-demand WASM solver benchmarks. Run with: bun run bench:wasm
// These measure absolute performance and are excluded from the regular test suite
// because their thresholds are machine-dependent.

import { describe, expect, it, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKG_DIR = join(import.meta.dir, '../../engine-rs/pkg');

type WasmMove = { card: { id: number }; position: number; score: number; robustness: number };

interface WasmSolverClass {
  new(): WasmSolverInstance;
}
interface WasmSolverInstance {
  solve(state_json: string): string;
  reset(): void;
  tt_size(): number;
  free(): void;
}

let wasm_simulate: (state_json: string) => string;
let WasmSolver: WasmSolverClass;

describe('WASM solver benchmarks', () => {
  beforeAll(async () => {
    const pkg = await import(`file://${join(PKG_DIR, 'engine_rs.js')}`);
    const wasmBytes = readFileSync(join(PKG_DIR, 'engine_rs_bg.wasm'));
    pkg.initSync({ module: wasmBytes });
    wasm_simulate = pkg.wasm_simulate;
    WasmSolver = pkg.WasmSolver;
  });

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
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false },
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
  }, 600_000);

  it('opening position solve with 10 distinct cards', () => {
    const p = [
      { id: 0, top: 10, right: 5, bottom: 3, left: 8,  type: 'none' },
      { id: 1, top: 7,  right: 6, bottom: 4, left: 9,  type: 'none' },
      { id: 2, top: 2,  right: 8, bottom: 6, left: 3,  type: 'none' },
      { id: 3, top: 5,  right: 4, bottom: 7, left: 1,  type: 'none' },
      { id: 4, top: 9,  right: 3, bottom: 2, left: 6,  type: 'none' },
    ];
    const o = [
      { id: 5, top: 4,  right: 7, bottom: 5, left: 2,  type: 'none' },
      { id: 6, top: 8,  right: 3, bottom: 9, left: 6,  type: 'none' },
      { id: 7, top: 1,  right: 5, bottom: 8, left: 4,  type: 'none' },
      { id: 8, top: 6,  right: 9, bottom: 1, left: 7,  type: 'none' },
      { id: 9, top: 3,  right: 2, bottom: 4, left: 10, type: 'none' },
    ];
    const state = {
      board: [null, null, null, null, null, null, null, null, null],
      playerHand: p,
      opponentHand: o,
      currentTurn: 'player',
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false },
    };

    const solver = new WasmSolver();
    const t0 = performance.now();
    const moves: WasmMove[] = JSON.parse(solver.solve(JSON.stringify(state)));
    const elapsed = performance.now() - t0;
    solver.free();

    expect(moves.length).toBe(45); // 5 cards × 9 positions
    console.log(`WASM opening position solve: ${elapsed.toFixed(0)}ms`);
  }, 90_000);
});
