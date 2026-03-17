// ABOUTME: Web Worker entry point for the WASM-backed minimax solver.
// ABOUTME: Loads the Rust/WASM engine and handles solve requests via the wasm_solve export.
import init, { wasm_solve } from '../../engine-rs/pkg/engine_rs.js';
import type { GameState, RankedMove } from './types';

type InMessage =
  | { type: 'solve'; state: GameState; generation: number };

type OutMessage =
  | { type: 'result'; moves: RankedMove[]; generation: number };

let initPromise: Promise<void> | null = null;

// Store the in-flight Promise so concurrent callers all await the same one.
async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => undefined);
  }
  await initPromise;
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'solve') {
    await ensureInit();
    const resultJson = wasm_solve(JSON.stringify(msg.state));
    const moves: RankedMove[] = JSON.parse(resultJson);
    self.postMessage({ type: 'result', moves, generation: msg.generation } satisfies OutMessage);
  }
};
