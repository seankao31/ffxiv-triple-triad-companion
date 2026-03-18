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

describe('cross-verification: TypeScript vs WASM solver', () => {
  beforeAll(async () => {
    const bgModule = await import(`file://${join(PKG_DIR, 'engine_rs_bg.js')}`);
    const wasmBytes = readFileSync(join(PKG_DIR, 'engine_rs_bg.wasm'));
    const wasmResult = await WebAssembly.instantiate(wasmBytes, {
      './engine_rs_bg.js': bgModule,
    });
    bgModule.__wbg_set_wasm(wasmResult.instance.exports);
    const exports = wasmResult.instance.exports as Record<string, unknown>;
    if (typeof exports['__wbindgen_start'] === 'function') {
      (exports['__wbindgen_start'] as () => void)();
    }
    wasm_solve = bgModule.wasm_solve;
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
});
