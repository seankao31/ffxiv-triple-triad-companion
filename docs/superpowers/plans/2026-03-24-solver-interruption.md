# Solver Interruption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminate and respawn WASM workers when a new solve triggers during an in-flight solve, so the user doesn't wait for stale computation to finish.

**Architecture:** `triggerSolve` in `store.ts` checks `solverLoading` before dispatching. If true, it terminates the busy worker(s) and creates fresh replacements. Workers self-init WASM via `ensureInit()` on first message. Server mode uses `AbortController` to cancel in-flight fetches. Generation counter remains as a safety net.

**Tech Stack:** Svelte stores, Web Workers, AbortController, vitest mocks

**Key files:**
- `src/app/store.ts` — all production changes
- `tests/app/setup.ts` — mock infrastructure update
- `tests/app/store.test.ts` — new and updated tests

**Benchmark context:** See `docs/decisions/2026-03-24-solver-interruption-benchmarks.md`. Worker reinit is 5ms. TT loss costs ~500ms on turn-2 (1.4s scratch vs 0.9s reuse). Not terminating costs 13–25s of waiting.

---

### Task 1: Update MockWorker for termination tracking

Mock `Worker.terminate()` is currently a no-op. Tests need to verify termination happens.

**Files:**
- Modify: `tests/app/setup.ts`

- [ ] **Step 1: Add `terminated` flag and reset helper**

```typescript
// In MockWorker interface, add:
terminated: boolean;

// In the mock class implementation:
terminated = false;
terminate() { this.terminated = true; }

// Guard postMessage — real browsers silently drop messages to terminated workers,
// but throwing in tests catches accidental posts to dead workers.
postMessage(msg: unknown) {
  if (this.terminated) throw new Error('postMessage called on terminated worker');
  this.postedMessages.push(msg);
}

// Add at module level:
export function resetWorkers() {
  workerInstances.length = 0;
  lastWorkerInstance = null;
}
```

- [ ] **Step 2: Run existing tests to verify no breakage**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All tests pass (no test currently triggers termination).

- [ ] **Step 3: Commit**

```
git add tests/app/setup.ts
git commit -m 'test: add termination tracking to MockWorker'
```

---

### Task 2: Extract worker factory functions (refactor)

Currently workers are created inline at module scope. Extract factory functions so termination can recreate workers with the same configuration.

**Files:**
- Modify: `src/app/store.ts`

- [ ] **Step 1: Extract `createSolverWorker()` and `createPimcPool()`**

This changes `const solverWorker` to `let solverWorker` (and same for `pimcWorkerPool`).
Note: `handleSwap` (line 289) and `startGame` (line 340) both reference `solverWorker`
directly for `postMessage({ type: 'newGame' })`. These continue to work correctly because
they always run when no solve is in-flight (swap/setup phase), so the mutable reference
always points to the current active worker.

Replace the inline worker creation (lines 67–137) with:

```typescript
const WORKER_URL = new URL('../engine/solver-wasm.worker.ts', import.meta.url);
const WORKER_OPTIONS: WorkerOptions = { type: 'module' };
const POOL_SIZE = Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null) ?? 4);

function createSolverWorker(): Worker {
  const w = new Worker(WORKER_URL, WORKER_OPTIONS);
  w.onmessage = (e: MessageEvent) => {
    const { type, generation } = e.data;
    if (generation !== solveGeneration) return;
    if (type === 'result') {
      rankedMoves.set(e.data.moves);
      solverLoading.set(false);
      pimcProgress.set(null);
    }
  };
  w.onerror = (e) => {
    console.error('Solver worker error:', e.message, e);
    solverLoading.set(false);
    pimcProgress.set(null);
  };
  return w;
}

function createPimcPool(): Worker[] {
  return Array.from({ length: POOL_SIZE }, () => {
    const w = new Worker(WORKER_URL, WORKER_OPTIONS);
    w.onmessage = handlePoolMessage;
    w.onerror = (e) => {
      console.error('PIMC worker error:', e.message, e);
    };
    return w;
  });
}

let solverWorker = createSolverWorker();
let pimcWorkerPool = createPimcPool();
```

Delete the old inline worker creation (the `const solverWorker = new Worker(...)`, the standalone `solverWorker.onmessage = ...` handler, the standalone `solverWorker.onerror = ...` handler, and the `const pimcWorkerPool = Array.from(...)` block).

- [ ] **Step 2: Export a test reset function**

At the bottom of store.ts, add:

```typescript
// Resets mutable worker state. Called from test beforeEach to prevent cross-test contamination
// when tests trigger worker termination and respawn.
export function _resetWorkersForTesting(): void {
  solverWorker = createSolverWorker();
  pimcWorkerPool = createPimcPool();
}
```

- [ ] **Step 3: Run all existing tests**

Run: `bunx vitest run tests/app/`
Expected: All 157 tests pass. This is a pure refactor — no behavior change.

- [ ] **Step 4: Commit**

```
git add src/app/store.ts
git commit -m 'refactor(store): extract worker factory functions'
```

---

### Task 3: Test + implement All Open worker termination

When `triggerSolve` is called while an All Open solve is in-flight (`solverLoading` is true and no unknown cards), terminate the solver worker and respawn.

**Files:**
- Modify: `tests/app/store.test.ts`
- Modify: `src/app/store.ts`

- [ ] **Step 1: Update `beforeEach` to reset workers**

Import `resetWorkers` from setup and `_resetWorkersForTesting` from store. Call both in `beforeEach`:

```typescript
import { lastWorkerInstance, workerInstances, resetWorkers } from './setup';
// add _resetWorkersForTesting to the existing store import

beforeEach(() => {
  resetCardIds();
  resetWorkers();
  _resetWorkersForTesting();
  game.set({ ... });  // existing reset
});
```

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All existing tests pass.

- [ ] **Step 2: Write failing test — solver worker terminated on in-flight solve**

Add a new `describe('solver interruption')` block:

```typescript
describe('solver interruption', () => {
  function setupAndStartGame() {
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    return get(game).playerHand;
  }

  it('terminates solver worker when a new solve triggers during in-flight All Open solve', () => {
    const freshHand = setupAndStartGame();
    // solverLoading is true — All Open solve is in-flight.
    expect(get(solverLoading)).toBe(true);
    const oldSolver = workerInstances[0]!;

    // Play a card → triggers new solve while old solve is in-flight.
    selectCard(freshHand[0]!);
    playCard(4);

    expect(oldSolver.terminated).toBe(true);
  });

  it('creates a new solver worker that receives the solve message after termination', () => {
    const freshHand = setupAndStartGame();
    const oldSolver = workerInstances[0]!;

    selectCard(freshHand[0]!);
    playCard(4);

    // New solver worker should exist and have received the solve message.
    const newSolver = workerInstances.find(
      (w) => w !== oldSolver && !w.terminated && w.postedMessages.some((m: any) => m.type === 'solve'),
    );
    expect(newSolver).toBeDefined();
    expect(newSolver!.postedMessages.some((m: any) => m.type === 'solve')).toBe(true);
  });
});
```

Run: `bunx vitest run tests/app/store.test.ts -t "terminates solver worker"`
Expected: FAIL — `oldSolver.terminated` is `false` (termination not implemented yet).

- [ ] **Step 3: Implement All Open termination in `triggerSolve`**

In `triggerSolve`, at the start of the All Open branch (the `else` at line 226), add termination before posting:

```typescript
function triggerSolve(state: GameState) {
  const unknownCardIds = get(game).unknownCardIds;
  const wasLoading = get(solverLoading);
  solveGeneration++;
  solverLoading.set(true);

  const mode = get(solverMode);
  const endpoint = get(serverEndpoint);

  if (mode === 'server' && endpoint) {
    void triggerServerSolve(state, solveGeneration);
    return;
  }

  if (unknownCardIds.size > 0) {
    // ... PIMC path (unchanged for now) ...
  } else {
    if (wasLoading) {
      solverWorker.terminate();
      solverWorker = createSolverWorker();
    }
    solverWorker.postMessage({ type: 'solve', state, generation: solveGeneration });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat(store): terminate All Open solver worker on in-flight interruption'
```

---

### Task 4: Test + implement PIMC pool termination

When `triggerSolve` is called while PIMC simulations are in-flight, terminate all pool workers and respawn.

**Files:**
- Modify: `tests/app/store.test.ts`
- Modify: `src/app/store.ts`

- [ ] **Step 1: Write failing test — pool workers terminated on in-flight PIMC**

Add to the `'solver interruption'` describe block:

```typescript
it('terminates PIMC pool workers when a new solve triggers during in-flight PIMC', () => {
  updateThreeOpen(true);
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  updateOpponentCard(0, createCard(5, 5, 5, 5));
  updateOpponentCard(1, createCard(5, 5, 5, 5));
  updateOpponentCard(2, createCard(5, 5, 5, 5));
  startGame();
  // PIMC in-flight: solverLoading = true, pool workers have sim messages.
  expect(get(solverLoading)).toBe(true);
  const oldPool = workerInstances.filter(
    (w) => w.postedMessages.some((m: any) => m.type === 'simulate'),
  );
  expect(oldPool.length).toBeGreaterThan(0);

  // Trigger a new solve by pushing a fake history entry.
  const initial = get(currentState)!;
  game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

  for (const w of oldPool) {
    expect(w.terminated).toBe(true);
  }
});

it('creates new PIMC pool workers that receive sim messages after termination', () => {
  updateThreeOpen(true);
  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  updateOpponentCard(0, createCard(5, 5, 5, 5));
  updateOpponentCard(1, createCard(5, 5, 5, 5));
  updateOpponentCard(2, createCard(5, 5, 5, 5));
  startGame();
  const oldPool = workerInstances.filter(
    (w) => w.postedMessages.some((m: any) => m.type === 'simulate'),
  );

  const initial = get(currentState)!;
  game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

  // New pool workers should exist (non-terminated, have sim messages from gen2).
  const gen2Messages = workerInstances.filter(
    (w) => !w.terminated && !oldPool.includes(w) && w.postedMessages.some((m: any) => m.type === 'simulate'),
  );
  expect(gen2Messages.length).toBeGreaterThan(0);
  const totalNewSims = gen2Messages.reduce(
    (sum, w) => sum + w.postedMessages.filter((m: any) => m.type === 'simulate').length,
    0,
  );
  expect(totalNewSims).toBe(50);
});
```

Run: `bunx vitest run tests/app/store.test.ts -t "terminates PIMC"`
Expected: FAIL — `oldPool` workers not terminated yet.

- [ ] **Step 2: Implement PIMC pool termination**

In `triggerSolve`, in the PIMC branch (`if (unknownCardIds.size > 0)`), add:

```typescript
if (unknownCardIds.size > 0) {
  if (wasLoading) {
    for (const w of pimcWorkerPool) w.terminate();
    pimcWorkerPool = createPimcPool();
  }
  // Reset PIMC batch state for this generation.
  pimcTally = new Map();
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Run tests**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat(store): terminate PIMC pool workers on in-flight interruption'
```

---

### Task 5: Test + implement server mode AbortController

When `triggerSolve` fires during an in-flight server request, abort the `fetch`.

**Files:**
- Modify: `tests/app/store.test.ts`
- Modify: `src/app/store.ts`

- [ ] **Step 1: Fix `vi.unstubAllGlobals()` in server test `afterEach`**

The existing `afterEach` in `'server solver mode'` calls `vi.unstubAllGlobals()`, which
also unstubs the global `Worker` mock from `setup.ts`. With the new `beforeEach` calling
`_resetWorkersForTesting()` (which creates Workers), this will crash subsequent tests.

Fix by replacing `vi.unstubAllGlobals()` with targeted cleanup:

```typescript
afterEach(() => {
  vi.restoreAllMocks();
  updateSolverMode('wasm');
  updateServerEndpoint('');
});
```

And change the server `beforeEach` to use `vi.spyOn` instead of `vi.stubGlobal`:

```typescript
beforeEach(() => {
  updateSolverMode('wasm');
  updateServerEndpoint('');
  vi.spyOn(globalThis, 'fetch').mockImplementation(vi.fn());
});
```

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All existing server tests pass.

- [ ] **Step 2: Write failing test — fetch aborted on new solve**

Add to the `'server solver mode'` describe block:

```typescript
it('aborts in-flight fetch when a new solve triggers', async () => {
  const endpoint = 'http://localhost:8080';
  updateServerEndpoint(endpoint);
  updateSolverMode('server');
  const mockFetch = vi.mocked(global.fetch);

  // First fetch: never resolves (simulates long-running solve).
  let firstSignal: AbortSignal | undefined;
  mockFetch.mockImplementationOnce((_url, init) => {
    firstSignal = (init as RequestInit).signal as AbortSignal;
    return new Promise(() => {}); // never resolves
  });
  // Second fetch: resolves immediately.
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ moves: [] }) } as Response);

  makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
  makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
  startGame(); // triggers first fetch

  expect(firstSignal).toBeDefined();
  expect(firstSignal!.aborted).toBe(false);

  // Trigger a new solve by pushing a fake history entry.
  const initial = get(currentState)!;
  game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

  expect(firstSignal!.aborted).toBe(true);
});
```

Run: `bunx vitest run tests/app/store.test.ts -t "aborts in-flight fetch"`
Expected: FAIL — no AbortController implemented yet.

- [ ] **Step 3: Implement AbortController**

In `store.ts`, add a module-level controller:

```typescript
let serverAbortController: AbortController | null = null;
```

In `triggerSolve`, before the server branch:

```typescript
if (mode === 'server' && endpoint) {
  if (serverAbortController) serverAbortController.abort();
  serverAbortController = new AbortController();
  void triggerServerSolve(state, solveGeneration, serverAbortController.signal);
  return;
}
```

Update `triggerServerSolve` signature and fetch call:

```typescript
async function triggerServerSolve(state: GameState, generation: number, signal: AbortSignal): Promise<void> {
  // ... existing setup code ...
  try {
    const response = await fetch(`${endpoint}/api/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ... }),
      signal,
    });
    // ... rest unchanged ...
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // expected on interruption
    console.error('Server solve error:', e);
    if (generation === solveGeneration) {
      solverLoading.set(false);
      pimcProgress.set(null);
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/app/store.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat(store): abort in-flight server fetch on solver interruption'
```

---

### Task 6: Test worker preservation when not loading

Verify that workers are NOT terminated when no solve is in-flight (preserving TT).

**Files:**
- Modify: `tests/app/store.test.ts`

- [ ] **Step 1: Write test — worker preserved when solve completes before next trigger**

Add to the `'solver interruption'` describe block:

```typescript
it('does not terminate solver worker when no solve is in-flight', () => {
  const freshHand = setupAndStartGame();
  const solver = workerInstances[0]!;

  // Simulate the solver finishing: deliver a result for the current generation.
  const gen = (solver.lastPostedMessage as any).generation;
  solver.onmessage!({ data: { type: 'result', generation: gen, moves: [] } } as MessageEvent);
  expect(get(solverLoading)).toBe(false);

  // Now play a card — should NOT terminate, should reuse the same worker.
  selectCard(freshHand[0]!);
  playCard(4);
  expect(solver.terminated).toBe(false);
  expect(solver.postedMessages.filter((m: any) => m.type === 'solve')).toHaveLength(2);
});
```

- [ ] **Step 2: Run test**

Run: `bunx vitest run tests/app/store.test.ts -t "does not terminate"`
Expected: PASS (this should already work from the Task 3 implementation).

- [ ] **Step 3: Commit**

```
git add tests/app/store.test.ts
git commit -m 'test(store): verify worker preserved when no solve in-flight'
```

---

### Task 7: Full test suite verification and type check

The `resetWorkers()` + `_resetWorkersForTesting()` in `beforeEach` should give each test
a clean 5-worker array (indices 0–4), so existing `workerInstances[0]`,
`workerInstances.slice(1)`, and `lastWorkerInstance` references should still work.
This task verifies that and fixes any breakage.

**Files:**
- Possibly modify: `tests/app/store.test.ts`

- [ ] **Step 1: Run the full app test suite**

Run: `bunx vitest run tests/app/`
Expected: All tests pass. If any existing tests fail due to the worker lifecycle
changes, fix them now (likely: index offsets, `lastWorkerInstance` references,
or the `'mid-flight generation bump'` test which triggers a second solve while
loading is true and will now cause worker termination).

- [ ] **Step 2: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit if any fixes were needed**

```
git add tests/app/store.test.ts
git commit -m 'test: fix existing tests for worker lifecycle changes'
```
