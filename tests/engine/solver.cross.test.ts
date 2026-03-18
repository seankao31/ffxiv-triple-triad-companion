// ABOUTME: Cross-verification: TypeScript and WASM solvers must agree on all ranked moves.
// ABOUTME: Covers existing solver fixtures and 1000 randomly generated mid-game positions.

import { describe, expect, it, beforeAll } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findBestMove } from '../../src/engine/solver';
import { CardType, Owner, type Card, type GameState, type PlacedCard, type Board } from '../../src/engine/types';

const PKG_DIR = join(import.meta.dir, '../../engine-rs/pkg');
const FIXTURES_DIR = join(import.meta.dir, '../../tests/fixtures/solver');

type WasmMove = { card: { id: number }; position: number; outcome: string; robustness: number };

let wasm_solve: (state_json: string) => string;
// WasmSolver exposes the persistent-TT solver as a JS class.
// It mirrors the Rust Solver struct: solve() reuses TT across calls; reset() clears it.
interface WasmSolverClass {
  new(): WasmSolverInstance;
}
interface WasmSolverInstance {
  solve(state_json: string): string;
  reset(): void;
  tt_size(): number;
  free(): void;
}
let WasmSolver: WasmSolverClass;

describe('cross-verification: TypeScript vs WASM solver', () => {
  beforeAll(async () => {
    // Use engine_rs.js (the complete wasm-pack package) which provides __wbg_get_imports()
    // including the __wbindgen_throw shim required when Rust code can panic.
    // initSync loads WASM from raw bytes — no fetch() needed, works in Bun.
    const pkg = await import(`file://${join(PKG_DIR, 'engine_rs.js')}`);
    const wasmBytes = readFileSync(join(PKG_DIR, 'engine_rs_bg.wasm'));
    pkg.initSync({ module: wasmBytes });
    wasm_solve = pkg.wasm_solve;
    WasmSolver = pkg.WasmSolver;
  });

  // Sort order: Win < Draw < Loss, then higher robustness, then lower card.id, then lower position.
  // Applying identical sort to both engines eliminates false positives from tie-ordering differences.
  const OUTCOME_RANK: Record<string, number> = { win: 0, draw: 1, loss: 2 };
  function canonicalize(moves: WasmMove[]): WasmMove[] {
    return [...moves].sort(
      (a, b) =>
        (OUTCOME_RANK[a.outcome] ?? 3) - (OUTCOME_RANK[b.outcome] ?? 3) ||
        b.robustness - a.robustness ||
        a.card.id - b.card.id ||
        a.position - b.position,
    );
  }

  // --- Fixture-based cross-check ---

  interface Fixture {
    name: string;
    state: GameState;
    expected: Array<{ cardId: number; position: number; outcome: string; robustness: number }>;
  }

  const fixtures = readdirSync(FIXTURES_DIR)
    .filter((f: string) => f.endsWith('.json'))
    .sort();

  for (const file of fixtures) {
    it(`fixture: ${file.replace('.json', '')}`, () => {
      const fixture: Fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));

      const tsMoves: WasmMove[] = findBestMove(fixture.state).map((m) => ({
        card: { id: m.card.id },
        position: m.position,
        outcome: m.outcome as string,
        robustness: m.robustness,
      }));
      const wasmMoves: WasmMove[] = JSON.parse(wasm_solve(JSON.stringify(fixture.state)));

      const ts = canonicalize(tsMoves);
      const wasm = canonicalize(wasmMoves);

      expect(ts.length).toBe(wasm.length);
      for (let i = 0; i < ts.length; i++) {
        const a = ts[i]!;
        const b = wasm[i]!;
        expect(b.card.id).toBe(a.card.id);
        expect(b.position).toBe(a.position);
        expect(b.outcome).toBe(a.outcome);
        expect(Math.abs(b.robustness - a.robustness)).toBeLessThan(1e-9);
      }
    });
  }

  // --- Property-based test ---

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

  // Generates a valid game state with numFilled cells already occupied.
  // Uses 10 cards (IDs 0–9) with random stats; no capture rules (all false).
  // 5–7 filled cells leaves 2–4 remaining moves — small enough for fast evaluation.
  function generateState(rng: () => number): GameState {
    const allCards: Card[] = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      top: randInt(1, 10, rng),
      right: randInt(1, 10, rng),
      bottom: randInt(1, 10, rng),
      left: randInt(1, 10, rng),
      type: CardType.None,
    }));

    const numFilled = randInt(5, 7, rng);
    const positions = shuffle(
      Array.from({ length: 9 }, (_, i) => i),
      rng,
    )
      .slice(0, numFilled)
      .sort((a, b) => a - b);

    const shuffledCards = shuffle(allCards, rng);
    const boardArr: (PlacedCard | null)[] = Array(9).fill(null);
    for (let i = 0; i < numFilled; i++) {
      boardArr[positions[i]!] = {
        card: shuffledCards[i]!,
        owner: i % 2 === 0 ? Owner.Player : Owner.Opponent,
      };
    }

    // Player goes first: after numFilled placements,
    // player placed ceil(numFilled/2), opponent placed floor(numFilled/2).
    const playerPlaced = Math.ceil(numFilled / 2);
    const opponentPlaced = Math.floor(numFilled / 2);
    const remaining = shuffledCards.slice(numFilled);
    const playerHand = remaining.slice(0, 5 - playerPlaced);
    const opponentHand = remaining.slice(5 - playerPlaced, 5 - playerPlaced + (5 - opponentPlaced));

    return {
      board: boardArr as unknown as Board,
      playerHand,
      opponentHand,
      currentTurn: numFilled % 2 === 0 ? Owner.Player : Owner.Opponent,
      rules: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    };
  }

  it('agrees on 1000 random mid-game positions (seed=42)', () => {
    const rng = makeLCG(42);
    const diffs: string[] = [];

    for (let i = 0; i < 1000; i++) {
      const state = generateState(rng);
      const stateJson = JSON.stringify(state);

      const tsMoves: WasmMove[] = findBestMove(state).map((m) => ({
        card: { id: m.card.id },
        position: m.position,
        outcome: m.outcome as string,
        robustness: m.robustness,
      }));
      const wasmMoves: WasmMove[] = JSON.parse(wasm_solve(stateJson));

      const ts = canonicalize(tsMoves);
      const wasm = canonicalize(wasmMoves);

      if (ts.length !== wasm.length) {
        diffs.push(`iter ${i}: count ts=${ts.length} wasm=${wasm.length}`);
        if (diffs.length >= 5) break;
        continue;
      }

      for (let j = 0; j < ts.length; j++) {
        const a = ts[j]!;
        const b = wasm[j]!;
        if (
          a.card.id !== b.card.id ||
          a.position !== b.position ||
          a.outcome !== b.outcome ||
          Math.abs(a.robustness - b.robustness) > 1e-9
        ) {
          diffs.push(
            `iter ${i} move ${j}: ` +
              `ts={id=${a.card.id},pos=${a.position},out=${a.outcome},rob=${a.robustness.toFixed(6)}} ` +
              `wasm={id=${b.card.id},pos=${b.position},out=${b.outcome},rob=${b.robustness.toFixed(6)}}`,
          );
          if (diffs.length >= 5) break;
        }
      }
      if (diffs.length >= 5) break;
    }

    expect(diffs).toEqual([]);
  }, 300_000);

  it('agrees on 200 random mid-game positions with Plus+Same rules (seed=777)', () => {
    const rng = makeLCG(777);
    const diffs: string[] = [];

    for (let i = 0; i < 200; i++) {
      const base = generateState(rng);
      const state: GameState = {
        ...base,
        rules: { plus: true, same: true, reverse: false, fallenAce: false, ascension: false, descension: false },
      };
      const stateJson = JSON.stringify(state);

      const tsMoves: WasmMove[] = findBestMove(state).map((m) => ({
        card: { id: m.card.id },
        position: m.position,
        outcome: m.outcome as string,
        robustness: m.robustness,
      }));
      const wasmMoves: WasmMove[] = JSON.parse(wasm_solve(stateJson));

      const ts = canonicalize(tsMoves);
      const wasm = canonicalize(wasmMoves);

      if (ts.length !== wasm.length) {
        diffs.push(`iter ${i}: count ts=${ts.length} wasm=${wasm.length} rules=plus+same`);
        if (diffs.length >= 5) break;
        continue;
      }

      for (let j = 0; j < ts.length; j++) {
        const a = ts[j]!;
        const b = wasm[j]!;
        if (a.card.id !== b.card.id || a.position !== b.position || a.outcome !== b.outcome ||
            Math.abs(a.robustness - b.robustness) > 1e-9) {
          diffs.push(
            `iter ${i} move ${j} (plus+same): ` +
            `ts={id=${a.card.id},pos=${a.position},out=${a.outcome}} ` +
            `wasm={id=${b.card.id},pos=${b.position},out=${b.outcome}}`,
          );
          if (diffs.length >= 5) break;
        }
      }
      if (diffs.length >= 5) break;
    }

    expect(diffs).toEqual([]);
  }, 300_000);

  it('agrees on 200 random mid-game positions with Reverse+FallenAce rules (seed=888)', () => {
    const rng = makeLCG(888);
    const diffs: string[] = [];

    for (let i = 0; i < 200; i++) {
      const base = generateState(rng);
      const state: GameState = {
        ...base,
        rules: { plus: false, same: false, reverse: true, fallenAce: true, ascension: false, descension: false },
      };
      const stateJson = JSON.stringify(state);

      const tsMoves: WasmMove[] = findBestMove(state).map((m) => ({
        card: { id: m.card.id },
        position: m.position,
        outcome: m.outcome as string,
        robustness: m.robustness,
      }));
      const wasmMoves: WasmMove[] = JSON.parse(wasm_solve(stateJson));

      const ts = canonicalize(tsMoves);
      const wasm = canonicalize(wasmMoves);

      if (ts.length !== wasm.length) {
        diffs.push(`iter ${i}: count ts=${ts.length} wasm=${wasm.length} rules=reverse+fallenAce`);
        if (diffs.length >= 5) break;
        continue;
      }

      for (let j = 0; j < ts.length; j++) {
        const a = ts[j]!;
        const b = wasm[j]!;
        if (a.card.id !== b.card.id || a.position !== b.position || a.outcome !== b.outcome ||
            Math.abs(a.robustness - b.robustness) > 1e-9) {
          diffs.push(
            `iter ${i} move ${j} (reverse+fallenAce): ` +
            `ts={id=${a.card.id},pos=${a.position},out=${a.outcome}} ` +
            `wasm={id=${b.card.id},pos=${b.position},out=${b.outcome}}`,
          );
          if (diffs.length >= 5) break;
        }
      }
      if (diffs.length >= 5) break;
    }

    expect(diffs).toEqual([]);
  }, 300_000);

  // --- WASM performance ---

  it('wasm opening position solve completes within 60 seconds', () => {
    // Same 10-card set as TS performance test and Rust benchmarks.
    // Asserts WASM overhead is not catastrophically worse than TS (~21s).
    // Using WasmSolver (persistent TT) so first-turn TT allocation happens once.
    const p = [
      { id: 0, top: 10, right: 5, bottom: 3, left: 8,  type: CardType.None },
      { id: 1, top: 7,  right: 6, bottom: 4, left: 9,  type: CardType.None },
      { id: 2, top: 2,  right: 8, bottom: 6, left: 3,  type: CardType.None },
      { id: 3, top: 5,  right: 4, bottom: 7, left: 1,  type: CardType.None },
      { id: 4, top: 9,  right: 3, bottom: 2, left: 6,  type: CardType.None },
    ];
    const o = [
      { id: 5, top: 4,  right: 7, bottom: 5, left: 2,  type: CardType.None },
      { id: 6, top: 8,  right: 3, bottom: 9, left: 6,  type: CardType.None },
      { id: 7, top: 1,  right: 5, bottom: 8, left: 4,  type: CardType.None },
      { id: 8, top: 6,  right: 9, bottom: 1, left: 7,  type: CardType.None },
      { id: 9, top: 3,  right: 2, bottom: 4, left: 10, type: CardType.None },
    ];
    const state: GameState = {
      board: [null, null, null, null, null, null, null, null, null] as unknown as Board,
      playerHand: p,
      opponentHand: o,
      currentTurn: Owner.Player,
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

  // --- WasmSolver persistent TT ---

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
    // solver_late_game_win has only 1 empty cell — minimax terminates at the leaf without TT writes.
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
    // Use two independent mid-game states so both solves write TT entries.
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

  it('WasmSolver: turn-2 solve is at least 10× faster than turn-1 (warm TT)', () => {
    // Turn 1: cold TT, full search.
    // Turn 2 (same state): TT fully warm, should be near-instant.
    const p = [
      { id: 0, top: 10, right: 10, bottom: 10, left: 10, type: CardType.None },
      { id: 1, top: 10, right: 10, bottom: 10, left: 10, type: CardType.None },
      { id: 2, top: 10, right: 10, bottom: 10, left: 10, type: CardType.None },
      { id: 3, top: 10, right: 10, bottom: 10, left: 10, type: CardType.None },
      { id: 4, top: 10, right: 10, bottom: 10, left: 10, type: CardType.None },
    ];
    const o = [
      { id: 5, top: 1, right: 1, bottom: 1, left: 1, type: CardType.None },
      { id: 6, top: 1, right: 1, bottom: 1, left: 1, type: CardType.None },
      { id: 7, top: 1, right: 1, bottom: 1, left: 1, type: CardType.None },
      { id: 8, top: 1, right: 1, bottom: 1, left: 1, type: CardType.None },
      { id: 9, top: 1, right: 1, bottom: 1, left: 1, type: CardType.None },
    ];
    const state: GameState = {
      board: [null, null, null, null, null, null, null, null, null] as unknown as Board,
      playerHand: p,
      opponentHand: o,
      currentTurn: Owner.Player,
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
