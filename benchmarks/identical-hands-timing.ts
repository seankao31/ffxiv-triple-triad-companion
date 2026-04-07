// ABOUTME: One-off benchmark for identical-hands game with Plus rule.
// ABOUTME: Usage: bun benchmarks/identical-hands-timing.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PKG_DIR = join(import.meta.dir, '../engine-rs/pkg');
const WASM_JS = join(PKG_DIR, 'engine_rs.js');
const WASM_BG = join(PKG_DIR, 'engine_rs_bg.wasm');

if (!existsSync(WASM_JS) || !existsSync(WASM_BG)) {
  console.error('WASM build not found. Run: cd engine-rs && wasm-pack build --target web --release');
  process.exit(1);
}

const wasmBytes = readFileSync(WASM_BG);
const pkg = await import(`file://${WASM_JS}`);
pkg.initSync({ module: wasmBytes });
const { WasmSolver, wasm_simulate } = pkg;

// Identical hands: 4-8-8-1, 1-4-8-8, 8-2-8-A, 8-8-1-8, 8-2-3-8
const HAND = [
  { top: 4, right: 8, bottom: 8, left: 1,  type: 'none' },
  { top: 1, right: 4, bottom: 8, left: 8,  type: 'none' },
  { top: 8, right: 2, bottom: 8, left: 10, type: 'none' },
  { top: 8, right: 8, bottom: 1, left: 8,  type: 'none' },
  { top: 8, right: 2, bottom: 3, left: 8,  type: 'none' },
];

const PLAYER_HAND = HAND.map((c, i) => ({ id: i, ...c }));
const OPPONENT_HAND = HAND.map((c, i) => ({ id: i + 5, ...c }));

const PLUS_RULES = { plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false };

type Card = typeof PLAYER_HAND[0];
type RankedMove = { card: Card; position: number; outcome: string; robustness: number };

const openingState = {
  board: [null, null, null, null, null, null, null, null, null] as (null | unknown)[],
  playerHand: PLAYER_HAND,
  opponentHand: OPPONENT_HAND,
  currentTurn: 'player',
  rules: PLUS_RULES,
};

function applyFirstMove(state: typeof openingState, move: RankedMove) {
  const board = [...state.board];
  board[move.position] = { card: move.card, owner: state.currentTurn };
  const isPlayer = state.currentTurn === 'player';
  return {
    board,
    playerHand: isPlayer ? state.playerHand.filter(c => c.id !== move.card.id) : [...state.playerHand],
    opponentHand: isPlayer ? [...state.opponentHand] : state.opponentHand.filter(c => c.id !== move.card.id),
    currentTurn: isPlayer ? 'opponent' : 'player',
    rules: state.rules,
  };
}

console.log('Identical Hands + Plus Rule Benchmark');
console.log('=====================================');
console.log('Cards: 4-8-8-1, 1-4-8-8, 8-2-8-A, 8-8-1-8, 8-2-3-8');
console.log('Both hands identical. Player starts.\n');

// --- WASM ---
console.log('WASM:');

// Turn 1 from scratch
const solver1 = new WasmSolver();
const t1Start = performance.now();
const turn1Moves: RankedMove[] = JSON.parse(solver1.solve(JSON.stringify(openingState)));
const turn1Ms = performance.now() - t1Start;
const turn1TT = solver1.tt_size();
const bestMove = turn1Moves[0]!;
console.log(`  Turn 1 (from scratch): ${turn1Ms >= 1000 ? (turn1Ms/1000).toFixed(2) + 's' : turn1Ms.toFixed(1) + 'ms'}  (TT: ${turn1TT.toLocaleString()})`);
console.log(`  Best move: card ${bestMove.card.id} → pos ${bestMove.position} (${bestMove.outcome})`);

const turn2State = applyFirstMove(openingState, bestMove);

// Turn 2 with TT reuse
const t2ReuseStart = performance.now();
solver1.solve(JSON.stringify(turn2State));
const turn2ReuseMs = performance.now() - t2ReuseStart;
const turn2ReuseTT = solver1.tt_size();
solver1.free();
console.log(`  Turn 2 (TT reuse):    ${turn2ReuseMs >= 1000 ? (turn2ReuseMs/1000).toFixed(2) + 's' : turn2ReuseMs.toFixed(1) + 'ms'}  (TT: ${turn2ReuseTT.toLocaleString()})`);

// Turn 2 from scratch
const solver2 = new WasmSolver();
const t2FreshStart = performance.now();
solver2.solve(JSON.stringify(turn2State));
const turn2FreshMs = performance.now() - t2FreshStart;
const turn2FreshTT = solver2.tt_size();
solver2.free();
console.log(`  Turn 2 (from scratch): ${turn2FreshMs >= 1000 ? (turn2FreshMs/1000).toFixed(2) + 's' : turn2FreshMs.toFixed(1) + 'ms'}  (TT: ${turn2FreshTT.toLocaleString()})`);

// Single PIMC sim
const tSimStart = performance.now();
wasm_simulate(JSON.stringify(openingState));
const simMs = performance.now() - tSimStart;
console.log(`  Single PIMC sim:      ${simMs >= 1000 ? (simMs/1000).toFixed(2) + 's' : simMs.toFixed(1) + 'ms'}`);

// --- Server ---
console.log('\nNative Server:');
try {
  const healthResp = await fetch('http://127.0.0.1:8080/api/health', { signal: AbortSignal.timeout(3000) });
  if (!healthResp.ok) throw new Error();

  const serverSolve = async (state: unknown) => {
    const t0 = performance.now();
    const resp = await fetch('http://127.0.0.1:8080/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, unknownCardIds: [], cardPool: [], simCount: 0 }),
    });
    const ms = performance.now() - t0;
    if (!resp.ok) throw new Error(`${resp.status}`);
    const data: { moves: RankedMove[] } = await resp.json();
    return { moves: data.moves, ms };
  };

  const st1 = await serverSolve(openingState);
  console.log(`  Turn 1: ${st1.ms >= 1000 ? (st1.ms/1000).toFixed(2) + 's' : st1.ms.toFixed(1) + 'ms'}`);
  const st2 = await serverSolve(turn2State);
  console.log(`  Turn 2: ${st2.ms >= 1000 ? (st2.ms/1000).toFixed(2) + 's' : st2.ms.toFixed(1) + 'ms'}`);
} catch {
  console.log('  (server not reachable, skipping)');
}
