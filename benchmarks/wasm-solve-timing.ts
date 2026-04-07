// ABOUTME: Benchmarks WASM solver timing for turn-1 and turn-2 with/without TT reuse.
// ABOUTME: Usage: cd engine-rs && wasm-pack build --target web --release && cd .. && bun benchmarks/wasm-solve-timing.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PKG_DIR = join(import.meta.dir, '../engine-rs/pkg');
const WASM_JS = join(PKG_DIR, 'engine_rs.js');
const WASM_BG = join(PKG_DIR, 'engine_rs_bg.wasm');

if (!existsSync(WASM_JS) || !existsSync(WASM_BG)) {
  console.error('WASM build not found. Run: cd engine-rs && wasm-pack build --target web --release');
  process.exit(1);
}

// --- Load WASM ---
const wasmBytes = readFileSync(WASM_BG);
const pkg = await import(`file://${WASM_JS}`);

const t0Init = performance.now();
pkg.initSync({ module: wasmBytes });
const initMs = performance.now() - t0Init;

const { WasmSolver, wasm_simulate } = pkg;

// --- Card sets ---
// 10 distinct cards from the existing solver benchmarks.
const PLAYER_HAND = [
  { id: 0, top: 10, right: 5, bottom: 3, left: 8,  type: 'none' },
  { id: 1, top: 7,  right: 6, bottom: 4, left: 9,  type: 'none' },
  { id: 2, top: 2,  right: 8, bottom: 6, left: 3,  type: 'none' },
  { id: 3, top: 5,  right: 4, bottom: 7, left: 1,  type: 'none' },
  { id: 4, top: 9,  right: 3, bottom: 2, left: 6,  type: 'none' },
];
const OPPONENT_HAND = [
  { id: 5, top: 4,  right: 7, bottom: 5, left: 2,  type: 'none' },
  { id: 6, top: 8,  right: 3, bottom: 9, left: 6,  type: 'none' },
  { id: 7, top: 1,  right: 5, bottom: 8, left: 4,  type: 'none' },
  { id: 8, top: 6,  right: 9, bottom: 1, left: 7,  type: 'none' },
  { id: 9, top: 3,  right: 2, bottom: 4, left: 10, type: 'none' },
];

const NO_RULES = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false };
const PLUS_RULES = { ...NO_RULES, plus: true };

type Card = typeof PLAYER_HAND[0];
type RankedMove = { card: Card; position: number; outcome: string; robustness: number };

function makeOpeningState(rules: typeof NO_RULES) {
  return {
    board: [null, null, null, null, null, null, null, null, null] as (null | unknown)[],
    playerHand: PLAYER_HAND,
    opponentHand: OPPONENT_HAND,
    currentTurn: 'player',
    rules,
  };
}

// Apply a move to get the next state. Only valid for opening position (no captures on empty board).
function applyFirstMove(state: ReturnType<typeof makeOpeningState>, move: RankedMove) {
  const board = [...state.board];
  board[move.position] = { card: move.card, owner: state.currentTurn };

  const isPlayer = state.currentTurn === 'player';
  return {
    board,
    playerHand: isPlayer
      ? state.playerHand.filter(c => c.id !== move.card.id)
      : [...state.playerHand],
    opponentHand: isPlayer
      ? [...state.opponentHand]
      : state.opponentHand.filter(c => c.id !== move.card.id),
    currentTurn: isPlayer ? 'opponent' : 'player',
    rules: state.rules,
  };
}

interface BenchResult {
  label: string;
  ms: number;
  ttSize: number;
}

function runScenario(label: string, rules: typeof NO_RULES): BenchResult[] {
  const results: BenchResult[] = [];
  const openingState = makeOpeningState(rules);

  // 1. Turn 1 from scratch (fresh WasmSolver)
  const solver1 = new WasmSolver();
  const t1Start = performance.now();
  const turn1Moves: RankedMove[] = JSON.parse(solver1.solve(JSON.stringify(openingState)));
  const turn1Ms = performance.now() - t1Start;
  const turn1TT = solver1.tt_size();
  results.push({ label: `${label} — Turn 1 (from scratch)`, ms: turn1Ms, ttSize: turn1TT });

  // Build turn-2 state from the best move
  const bestMove = turn1Moves[0]!;
  const turn2State = applyFirstMove(openingState, bestMove);
  console.log(`  Best move: card ${bestMove.card.id} → pos ${bestMove.position} (${bestMove.outcome})`);

  // 2. Turn 2 with TT reuse (same solver that solved turn 1)
  const t2ReuseStart = performance.now();
  solver1.solve(JSON.stringify(turn2State));
  const turn2ReuseMs = performance.now() - t2ReuseStart;
  const turn2ReuseTT = solver1.tt_size();
  solver1.free();
  results.push({ label: `${label} — Turn 2 (TT reuse)`, ms: turn2ReuseMs, ttSize: turn2ReuseTT });

  // 3. Turn 2 from scratch (fresh WasmSolver, no prior TT)
  const solver2 = new WasmSolver();
  const t2FreshStart = performance.now();
  solver2.solve(JSON.stringify(turn2State));
  const turn2FreshMs = performance.now() - t2FreshStart;
  const turn2FreshTT = solver2.tt_size();
  solver2.free();
  results.push({ label: `${label} — Turn 2 (from scratch)`, ms: turn2FreshMs, ttSize: turn2FreshTT });

  // 4. Single PIMC sim from opening (wasm_simulate, fresh TT)
  const tSimStart = performance.now();
  wasm_simulate(JSON.stringify(openingState));
  const simMs = performance.now() - tSimStart;
  results.push({ label: `${label} — Single PIMC sim (opening)`, ms: simMs, ttSize: 0 });

  return results;
}

// --- Run benchmarks ---
console.log('WASM Solver Timing Benchmark');
console.log('============================\n');
console.log(`WASM initSync: ${initMs.toFixed(1)}ms\n`);

console.log('Scenario 1: No Rules');
console.log('--------------------');
const noRulesResults = runScenario('No Rules', NO_RULES);

console.log('\nScenario 2: Plus Rule');
console.log('---------------------');
const plusResults = runScenario('Plus', PLUS_RULES);

// --- Print summary table ---
const all = [...noRulesResults, ...plusResults];
const maxLabel = Math.max(...all.map(r => r.label.length));

console.log('\n\nSummary');
console.log('=======\n');
console.log(`${'Benchmark'.padEnd(maxLabel)}  ${'Time'.padStart(10)}  ${'TT entries'.padStart(12)}`);
console.log(`${'─'.repeat(maxLabel)}  ${'─'.repeat(10)}  ${'─'.repeat(12)}`);
for (const r of all) {
  const time = r.ms >= 1000 ? `${(r.ms / 1000).toFixed(2)}s` : `${r.ms.toFixed(1)}ms`;
  const tt = r.ttSize > 0 ? r.ttSize.toLocaleString() : '—';
  console.log(`${r.label.padEnd(maxLabel)}  ${time.padStart(10)}  ${tt.padStart(12)}`);
}

console.log(`\nWASM initSync: ${initMs.toFixed(1)}ms`);
