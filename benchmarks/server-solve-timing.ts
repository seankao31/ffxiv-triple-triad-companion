// ABOUTME: Benchmarks native solver server timing for turn-1 and turn-2 (both from scratch).
// ABOUTME: Usage: bun benchmarks/server-solve-timing.ts [server-url]  (default: http://127.0.0.1:8080)

const SERVER_URL = process.argv[2] || 'http://127.0.0.1:8080';

// --- Health check ---
try {
  const resp = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
} catch (e) {
  console.error(`Server not reachable at ${SERVER_URL}. Start it first:`);
  console.error('  cd engine-rs && cargo build --release --features server --bin server');
  console.error('  ./engine-rs/target/release/server');
  process.exit(1);
}

// --- Card sets (same as WASM benchmark) ---
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

async function serverSolve(state: unknown): Promise<{ moves: RankedMove[]; ms: number }> {
  const t0 = performance.now();
  const resp = await fetch(`${SERVER_URL}/api/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, unknownCardIds: [], cardPool: [], simCount: 0 }),
  });
  const elapsed = performance.now() - t0;
  if (!resp.ok) throw new Error(`Server error: ${resp.status} ${await resp.text()}`);
  const data: { moves: RankedMove[] } = await resp.json();
  return { moves: data.moves, ms: elapsed };
}

interface BenchResult {
  label: string;
  ms: number;
}

async function runScenario(label: string, rules: typeof NO_RULES): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  const openingState = makeOpeningState(rules);

  // 1. Turn 1 (opening position — server always starts from scratch)
  const turn1 = await serverSolve(openingState);
  results.push({ label: `${label} — Turn 1`, ms: turn1.ms });

  // Build turn-2 state from the best move
  const bestMove = turn1.moves[0]!;
  const turn2State = applyFirstMove(openingState, bestMove);
  console.log(`  Best move: card ${bestMove.card.id} → pos ${bestMove.position} (${bestMove.outcome})`);

  // 2. Turn 2 (server is stateless — always from scratch, no TT reuse)
  const turn2 = await serverSolve(turn2State);
  results.push({ label: `${label} — Turn 2`, ms: turn2.ms });

  return results;
}

// --- Run benchmarks ---
console.log('Native Server Solve Timing Benchmark');
console.log(`Server: ${SERVER_URL}`);
console.log('====================================\n');

console.log('Scenario 1: No Rules');
console.log('--------------------');
const noRulesResults = await runScenario('No Rules', NO_RULES);

console.log('\nScenario 2: Plus Rule');
console.log('---------------------');
const plusResults = await runScenario('Plus', PLUS_RULES);

// --- Print summary table ---
const all = [...noRulesResults, ...plusResults];
const maxLabel = Math.max(...all.map(r => r.label.length));

console.log('\n\nSummary');
console.log('=======\n');
console.log(`${'Benchmark'.padEnd(maxLabel)}  ${'Time'.padStart(10)}`);
console.log(`${'─'.repeat(maxLabel)}  ${'─'.repeat(10)}`);
for (const r of all) {
  const time = r.ms >= 1000 ? `${(r.ms / 1000).toFixed(2)}s` : `${r.ms.toFixed(1)}ms`;
  console.log(`${r.label.padEnd(maxLabel)}  ${time.padStart(10)}`);
}

console.log('\nNote: Server creates a fresh TT per request — no TT reuse across calls.');
console.log('Times include network round-trip (localhost).');
