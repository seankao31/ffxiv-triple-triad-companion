// ABOUTME: Verifies the WASM solver against fixture expectations and tests WasmSolver persistent TT.
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

type WasmMove = { card: { id: number }; position: number; outcome: string; robustness: number };

interface WasmSolverClass {
  new(): WasmSolverInstance;
}
interface WasmSolverInstance {
  solve(state_json: string): string;
  reset(): void;
  tt_size(): number;
  free(): void;
}

let wasm_solve: (state_json: string) => string;
let wasm_simulate: (state_json: string) => string;
let WasmSolver: WasmSolverClass;

// Generates a valid mid-game state with numFilled cells already occupied.
// Uses 10 cards (IDs 0–9) with random stats; no capture rules.
// 5–7 filled cells leaves 2–4 remaining moves — small enough for fast evaluation.
function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function generateState(rng: () => number): unknown {
  const allCards = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    top: randInt(1, 10, rng),
    right: randInt(1, 10, rng),
    bottom: randInt(1, 10, rng),
    left: randInt(1, 10, rng),
    type: 'none',
  }));

  const numFilled = randInt(5, 7, rng);
  const positions = shuffle(
    Array.from({ length: 9 }, (_, i) => i),
    rng,
  )
    .slice(0, numFilled)
    .sort((a, b) => a - b);

  const shuffledCards = shuffle(allCards, rng);
  const boardArr: unknown[] = Array(9).fill(null);
  for (let i = 0; i < numFilled; i++) {
    boardArr[positions[i]!] = {
      card: shuffledCards[i]!,
      owner: i % 2 === 0 ? 'player' : 'opponent',
    };
  }

  const playerPlaced = Math.ceil(numFilled / 2);
  const opponentPlaced = Math.floor(numFilled / 2);
  const remaining = shuffledCards.slice(numFilled);
  const playerHand = remaining.slice(0, 5 - playerPlaced);
  const opponentHand = remaining.slice(5 - playerPlaced, 5 - playerPlaced + (5 - opponentPlaced));

  return {
    board: boardArr,
    playerHand,
    opponentHand,
    currentTurn: numFilled % 2 === 0 ? 'player' : 'opponent',
    rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
  };
}

describe('WASM solver', () => {
  beforeAll(async () => {
    // Use engine_rs.js (web target) with initSync — works in Bun without a bundler.
    // initSync loads WASM from raw bytes synchronously; no fetch() needed.
    const pkg = await import(`file://${join(PKG_DIR, 'engine_rs.js')}`);
    const wasmBytes = readFileSync(join(PKG_DIR, 'engine_rs_bg.wasm'));
    pkg.initSync({ module: wasmBytes });
    wasm_solve = pkg.wasm_solve;
    wasm_simulate = pkg.wasm_simulate;
    WasmSolver = pkg.WasmSolver;
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
    // Each WASM sim is a full minimax solve from opening position with a fresh TT.
    // Baseline: ~5524ms/sim (release WASM). Threshold: 16572ms to catch regressions.
    expect(perSimMs).toBeLessThan(16572);
  }, 600_000);

  // --- WasmSolver (persistent TT) ---

  it('wasm opening position solve completes within 60 seconds', () => {
    // Same 10-card set used in Rust benchmarks.
    // Uses WasmSolver (persistent TT) so first-turn TT allocation happens once.
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
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    };

    const solver = new WasmSolver();
    const t0 = performance.now();
    const moves: WasmMove[] = JSON.parse(solver.solve(JSON.stringify(state)));
    const elapsed = performance.now() - t0;
    solver.free();

    expect(moves.length).toBe(45); // 5 cards × 9 positions
    console.log(`WASM opening position solve: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(60_000); // 60s — generous bound; expected ~20-30s
  }, 90_000);

  it('WasmSolver.solve() returns same results as wasm_solve()', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, 'solver_late_game_win.json'), 'utf-8'));
    const stateJson = JSON.stringify(fixture.state);

    const solver = new WasmSolver();
    const solverResult: WasmMove[] = JSON.parse(solver.solve(stateJson));
    const wasm_result: WasmMove[] = JSON.parse(wasm_solve(stateJson));
    solver.free();

    expect(solverResult.length).toBe(wasm_result.length);
    for (let i = 0; i < solverResult.length; i++) {
      expect(solverResult[i]!.card.id).toBe(wasm_result[i]!.card.id);
      expect(solverResult[i]!.position).toBe(wasm_result[i]!.position);
      expect(solverResult[i]!.outcome).toBe(wasm_result[i]!.outcome);
    }
  });

  it('WasmSolver: TT is populated after solve() and empty after reset()', () => {
    // Use a mid-game state (5-7 cells filled) so minimax recurses and writes TT entries.
    const stateJson = JSON.stringify(generateState(makeLCG(42)));

    const solver = new WasmSolver();
    expect(solver.tt_size()).toBe(0);

    solver.solve(stateJson);
    expect(solver.tt_size()).toBeGreaterThan(0);

    solver.reset();
    expect(solver.tt_size()).toBe(0);

    solver.free();
  });

  it('WasmSolver: TT grows across successive solve() calls on different states', () => {
    const rng = makeLCG(99);
    const s1Json = JSON.stringify(generateState(rng));
    const s2Json = JSON.stringify(generateState(rng));

    const solver = new WasmSolver();
    solver.solve(s1Json);
    const sizeAfterFirst = solver.tt_size();
    expect(sizeAfterFirst).toBeGreaterThan(0);

    solver.solve(s2Json);
    const sizeAfterSecond = solver.tt_size();
    // TT may grow or stay the same (entries could overlap), but never shrinks without reset()
    expect(sizeAfterSecond).toBeGreaterThanOrEqual(sizeAfterFirst);

    solver.free();
  });

  it('WasmSolver: solve() after reset() still returns correct results', () => {
    const stateJson = JSON.stringify(generateState(makeLCG(42)));
    const reference: WasmMove[] = JSON.parse(wasm_solve(stateJson));

    const solver = new WasmSolver();
    solver.solve(stateJson);  // warm the TT
    solver.reset();
    const afterReset: WasmMove[] = JSON.parse(solver.solve(stateJson));
    solver.free();

    expect(afterReset.length).toBe(reference.length);
    for (let i = 0; i < afterReset.length; i++) {
      expect(afterReset[i]!.card.id).toBe(reference[i]!.card.id);
      expect(afterReset[i]!.position).toBe(reference[i]!.position);
      expect(afterReset[i]!.outcome).toBe(reference[i]!.outcome);
    }
  });

  it('WasmSolver: turn-2 solve with 10 distinct cards is at least 10× faster than turn-1', () => {
    // With depth-aware TT replacement: root-adjacent entries survive, turn-2 is near-instant.
    // With always-overwrite: 99%+ fill evicts them; turn-2 is nearly as slow as turn-1.
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
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    };

    const solver = new WasmSolver();
    const t0 = performance.now();
    solver.solve(JSON.stringify(state));
    const firstMs = performance.now() - t0;
    const ttAfterFirst = solver.tt_size();

    const t1 = performance.now();
    solver.solve(JSON.stringify(state));
    const secondMs = performance.now() - t1;
    const ttAfterSecond = solver.tt_size();
    solver.free();

    console.log(`Turn 1: ${firstMs.toFixed(0)}ms (TT: ${ttAfterFirst}), Turn 2: ${secondMs.toFixed(0)}ms (TT: ${ttAfterSecond})`);
    expect(secondMs * 10).toBeLessThan(firstMs + 1);
  }, 300_000);

  it('WasmSolver: turn-2 solve is at least 10× faster than turn-1 (warm TT)', () => {
    const p = [
      { id: 0, top: 10, right: 10, bottom: 10, left: 10, type: 'none' },
      { id: 1, top: 10, right: 10, bottom: 10, left: 10, type: 'none' },
      { id: 2, top: 10, right: 10, bottom: 10, left: 10, type: 'none' },
      { id: 3, top: 10, right: 10, bottom: 10, left: 10, type: 'none' },
      { id: 4, top: 10, right: 10, bottom: 10, left: 10, type: 'none' },
    ];
    const o = [
      { id: 5, top: 1, right: 1, bottom: 1, left: 1, type: 'none' },
      { id: 6, top: 1, right: 1, bottom: 1, left: 1, type: 'none' },
      { id: 7, top: 1, right: 1, bottom: 1, left: 1, type: 'none' },
      { id: 8, top: 1, right: 1, bottom: 1, left: 1, type: 'none' },
      { id: 9, top: 1, right: 1, bottom: 1, left: 1, type: 'none' },
    ];
    const state = {
      board: [null, null, null, null, null, null, null, null, null],
      playerHand: p,
      opponentHand: o,
      currentTurn: 'player',
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    };

    const solver = new WasmSolver();
    expect(solver.tt_size()).toBe(0);

    const t0 = performance.now();
    solver.solve(JSON.stringify(state));
    const firstMs = performance.now() - t0;
    const ttAfterFirst = solver.tt_size();

    const t1 = performance.now();
    solver.solve(JSON.stringify(state));
    const secondMs = performance.now() - t1;
    const ttAfterSecond = solver.tt_size();
    solver.free();

    console.log(`Turn 1: ${firstMs.toFixed(0)}ms (TT: ${ttAfterFirst}), Turn 2: ${secondMs.toFixed(0)}ms (TT: ${ttAfterSecond})`);
    // Second call should be dramatically faster (TT already populated from first call).
    expect(secondMs * 10).toBeLessThan(firstMs + 1);
  }, 300_000);
});
