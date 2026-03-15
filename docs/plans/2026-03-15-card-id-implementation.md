# Card Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `id: number` to `Card`, use it in the TT hash, and remove all code that existed solely because cards lacked identity (`buildCardIndex`, `cardEquals`, `reset()` hand params).

**Architecture:** Auto-increment ID assigned in `createCard`. `hashState` uses `card.id + 1` directly instead of a stats-derived compact index. `buildCardIndex` and its param threading are deleted entirely. `cardEquals` is deleted; callers use `a.id === b.id` directly.

**Tech Stack:** TypeScript (strict), Bun test (`bun test tests/engine`), Vitest (`bunx vitest run`), Svelte 5 components.

---

### Task 1: Write the failing TT regression test

**Files:**
- Modify: `tests/engine/solver.test.ts` (append new describe block)

**Step 1: Append the failing test to solver.test.ts**

Add this block at the end of the file (before the closing of the last describe if needed — just append):

```typescript
describe("createSolver — duplicate-stats card identity", () => {
  it("persistent TT gives correct cross-turn predictions when both hands contain identical-stats cards", () => {
    // p[0] and o[0] have the same stats (5,5,5,5). Under the old buildCardIndex
    // scheme both map to the same card index, so TT entries computed for one
    // player's copy are incorrectly reused for the other player's copy —
    // corrupting cross-turn outcome predictions.
    const p = [
      createCard(5, 5, 5, 5),   // shared stats with o[0]
      createCard(10, 10, 10, 10),
      createCard(10, 10, 10, 10),
      createCard(10, 10, 10, 10),
      createCard(10, 10, 10, 10),
    ];
    const o = [
      createCard(5, 5, 5, 5),   // shared stats with p[0]
      createCard(1, 1, 1, 1),
      createCard(1, 1, 1, 1),
      createCard(1, 1, 1, 1),
      createCard(1, 1, 1, 1),
    ];
    const opening = createInitialState(p, o);
    const solver = createSolver();
    solver.reset(p, o);

    const openingMoves = solver.solve(opening);
    const openingOutcome = openingMoves[0]!.outcome;

    // After Player's first move, Opponent should face the mirror outcome.
    // With TT corruption the persistent solver may return a wrong outcome here.
    const stateAfter1 = placeCard(opening, openingMoves[0]!.card, openingMoves[0]!.position);
    const movesAfter1 = solver.solve(stateAfter1);
    const outcomeAfter1 = movesAfter1[0]!.outcome;

    const mirror = (o: Outcome) =>
      o === Outcome.Win ? Outcome.Loss : o === Outcome.Loss ? Outcome.Win : Outcome.Draw;

    expect(outcomeAfter1).toBe(mirror(openingOutcome));
  });
});
```

**Step 2: Run the new test and confirm it FAILS**

```bash
cd /Users/seankao/Workplace/Projects/ffxiv-triple-triad-companion
bun test tests/engine/solver.test.ts --test-name-pattern "duplicate-stats"
```

Expected: FAIL. If it passes, the bug does not manifest for this specific hand — swap the `p`/`o` arrays to use more balanced cards (e.g., give Opp a 5,5,5,5 and some 6,6,6,6 cards so the game is closer). The test MUST be observed to fail before continuing.

**Step 3: Commit**

```bash
git add tests/engine/solver.test.ts
git commit -m 'test: failing regression test for duplicate-stats TT hash collision'
```

---

### Task 2: Add `id` to `Card` and update `createCard`

**Files:**
- Modify: `src/engine/types.ts`

**Step 1: Add the module-level counter and update the interface + factory**

In `src/engine/types.ts`, make these changes:

1. Add `readonly id: number;` as the FIRST field of the `Card` interface (before `top`).

2. Add a module-level counter just above the `Card` interface:
   ```typescript
   let _nextCardId = 0;
   ```

3. Update `createCard` to assign the id:
   ```typescript
   export function createCard(
     top: number,
     right: number,
     bottom: number,
     left: number,
     type: CardType = CardType.None,
   ): Card {
     return { id: _nextCardId++, top, right, bottom, left, type };
   }
   ```

Do NOT touch `cardEquals` yet — that comes in Task 5.

**Step 2: Run all engine tests**

```bash
bun test tests/engine
```

Expected: All tests pass EXCEPT the new "duplicate-stats" test from Task 1 (still failing — the solver fix hasn't landed yet).

**Step 3: Run all app tests**

```bash
bunx vitest run
```

Expected: All pass. Card objects now carry an `id` field; all `toEqual` assertions still pass because they compare the same card object references.

**Step 4: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/engine/types.ts
git commit -m 'feat: add unique id to Card, assigned at construction time'
```

---

### Task 3: Refactor `solver.ts` to use `card.id`

This is the core fix. It removes `buildCardIndex`, eliminates the `cardIndex` parameter from all internal functions, simplifies `hashState` to use `card.id` directly, renames `cardId` (stats hash) to `statsKey` to avoid naming confusion, and simplifies `reset()` to take no parameters.

**Files:**
- Modify: `src/engine/solver.ts`
- Modify: `tests/engine/solver.test.ts` (update `solver.reset(p, o)` calls)

**Step 1: Rewrite `solver.ts`**

The complete new file content:

```typescript
// ABOUTME: Minimax solver with alpha-beta pruning and transposition table.
// ABOUTME: Returns moves ranked by outcome (Win > Draw > Loss) from the current player's perspective.

import { type GameState, type RankedMove, type Card, Owner, Outcome } from "./types";
import { placeCard } from "./board";

// Stats-based hash for dedup only: skips identical-stats cards within the same hand.
// Not used for TT hashing — card.id is used there.
const TYPE_IDX: Record<string, number> = { none: 0, primal: 1, scion: 2, society: 3, garlean: 4 };

function statsKey(c: Card): number {
  return c.top * 5000 + c.right * 500 + c.bottom * 50 + c.left * 5 + TYPE_IDX[c.type]!;
}

// Encodes board + turn as a single number for use as a Map key.
// Each cell: 0 = empty, (id+1)*2-1 = card owned by player, (id+1)*2 = card owned by opponent.
// Turn bit occupies bit 0 (0=player, 1=opponent). Cells packed starting at bit 1 (shift=2),
// 5 bits each (max cell value 20 < 32). Total: 1 + 9*5 = 46 bits (safe integer).
function hashState(board: GameState["board"], currentTurn: Owner): number {
  let h = currentTurn === Owner.Player ? 0 : 1;
  let shift = 2;
  for (let i = 0; i < 9; i++) {
    const cell = board[i];
    if (cell) {
      const idx = cell.card.id + 1;
      h += (cell.owner === Owner.Player ? idx * 2 - 1 : idx * 2) * shift;
    }
    shift *= 32;
  }
  return h;
}

function boardFull(board: GameState["board"]): boolean {
  return board.every(cell => cell !== null);
}

// Evaluates terminal state score. Returns 1 for evaluatingFor wins, -1 for loss, 0 for draw.
function terminalValue(state: GameState, evaluatingFor: Owner): number {
  let player = state.playerHand.length;
  let opponent = state.opponentHand.length;
  for (let i = 0; i < 9; i++) {
    const cell = state.board[i];
    if (cell) {
      if (cell.owner === Owner.Player) player++;
      else opponent++;
    }
  }
  if (player > opponent) return evaluatingFor === Owner.Player ? 1 : -1;
  if (player < opponent) return evaluatingFor === Owner.Player ? -1 : 1;
  return 0;
}

const enum TTFlag {
  Exact = 0,
  LowerBound = 1,
  UpperBound = 2,
}

interface TTEntry {
  readonly value: number;
  readonly flag: TTFlag;
}

// Returns 1 for win, 0 for draw, -1 for loss from evaluatingFor's perspective.
function minimax(
  state: GameState,
  evaluatingFor: Owner,
  alpha: number,
  beta: number,
  tt: Map<number, TTEntry>,
): number {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;

  // Terminal state: no cards to play or board is full
  if (hand.length === 0 || boardFull(state.board)) return terminalValue(state, evaluatingFor);

  const key = hashState(state.board, state.currentTurn);
  const cached = tt.get(key);
  if (cached !== undefined) {
    if (cached.flag === TTFlag.Exact) return cached.value;
    if (cached.flag === TTFlag.LowerBound) {
      if (cached.value >= beta) return cached.value;
      alpha = Math.max(alpha, cached.value);
    }
    if (cached.flag === TTFlag.UpperBound) {
      if (cached.value <= alpha) return cached.value;
      beta = Math.min(beta, cached.value);
    }
    if (alpha >= beta) return cached.value;
  }

  const isMaximizing = state.currentTurn === evaluatingFor;
  const origAlpha = alpha;
  const origBeta = beta;
  let bestValue = isMaximizing ? -Infinity : Infinity;

  // Deduplicate identical-stats cards within the same hand to avoid redundant searches
  const seenCards = new Set<number>();

  outer:
  for (let ci = 0; ci < hand.length; ci++) {
    const card = hand[ci]!;
    const ck = statsKey(card);
    if (seenCards.has(ck)) continue;
    seenCards.add(ck);

    for (let i = 0; i < 9; i++) {
      if (state.board[i] !== null) continue;

      const nextState = placeCard(state, card, i);
      const value = minimax(nextState, evaluatingFor, alpha, beta, tt);

      if (isMaximizing) {
        if (value > bestValue) bestValue = value;
        if (value > alpha) alpha = value;
      } else {
        if (value < bestValue) bestValue = value;
        if (value < beta) beta = value;
      }
      if (alpha >= beta) break outer;
    }
  }

  // Determine bound type based on whether pruning narrowed the window
  let flag: TTFlag;
  if (isMaximizing) {
    flag = bestValue <= origAlpha ? TTFlag.UpperBound
         : bestValue >= beta ? TTFlag.LowerBound
         : TTFlag.Exact;
  } else {
    flag = bestValue >= origBeta ? TTFlag.LowerBound
         : bestValue <= alpha ? TTFlag.UpperBound
         : TTFlag.Exact;
  }
  tt.set(key, { value: bestValue, flag });

  return bestValue;
}

function findBestMoveWith(state: GameState, tt: Map<number, TTEntry>): RankedMove[] {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;

  if (hand.length === 0) return [];

  if (boardFull(state.board)) return [];

  // All minimax calls use Owner.Player as evaluatingFor so TT values are always from
  // Player's perspective. This makes TT entries safe to reuse across turns even when
  // the persistent solver is in use (currentTurn flips each turn, but the stored values
  // never change meaning).
  const currentIsPlayer = state.currentTurn === Owner.Player;

  // First pass: evaluate all moves with minimax
  const evaluated: { card: Card; position: number; value: number; nextState: GameState }[] = [];
  const seenCards = new Set<number>();

  for (const card of hand) {
    const ck = statsKey(card);
    if (seenCards.has(ck)) continue;
    seenCards.add(ck);

    for (let i = 0; i < 9; i++) {
      if (state.board[i] !== null) continue;

      const nextState = placeCard(state, card, i);
      const value = minimax(nextState, Owner.Player, -Infinity, Infinity, tt);
      evaluated.push({ card, position: i, value, nextState });
    }
  }

  // Second pass: calculate robustness for tie-breaking.
  // For each move, count what fraction of opponent responses maintain the same outcome.
  const moves: RankedMove[] = evaluated.map(({ card, position, value, nextState }) => {
    const oppHand = nextState.currentTurn === Owner.Player ? nextState.playerHand : nextState.opponentHand;

    let totalResponses = 0;
    let betterOutcomeCount = 0;

    for (const oppCard of oppHand) {
      for (let i = 0; i < 9; i++) {
        if (nextState.board[i] !== null) continue;

        totalResponses++;
        const responseState = placeCard(nextState, oppCard, i);
        const responseValue = minimax(responseState, Owner.Player, -Infinity, Infinity, tt);

        // "Better" means: better for the current player (state.currentTurn).
        // Values are from Player's perspective: higher = better for Player.
        if (currentIsPlayer ? responseValue > value : responseValue < value) betterOutcomeCount++;
      }
    }

    // value is from Player's perspective; flip sign when it's Opponent's turn.
    const effectiveValue = currentIsPlayer ? value : -value;
    const outcome = effectiveValue === 1 ? Outcome.Win : effectiveValue === -1 ? Outcome.Loss : Outcome.Draw;
    const robustness = totalResponses > 0 ? betterOutcomeCount / totalResponses : 0;
    return { card, position, outcome, robustness };
  });

  // Sort: wins first, then draws, then losses; within same outcome, higher robustness first
  const outcomeOrder = { win: 0, draw: 1, loss: 2 };
  moves.sort((a, b) => {
    const orderDiff = outcomeOrder[a.outcome] - outcomeOrder[b.outcome];
    if (orderDiff !== 0) return orderDiff;
    return b.robustness - a.robustness;
  });

  return moves;
}

export function findBestMove(state: GameState): RankedMove[] {
  const tt = new Map<number, TTEntry>();
  return findBestMoveWith(state, tt);
}

export interface Solver {
  reset(): void;
  solve(state: GameState): RankedMove[];
  ttSize(): number;
}

export function createSolver(): Solver {
  let tt = new Map<number, TTEntry>();

  return {
    reset() {
      tt = new Map();
    },
    solve(state: GameState): RankedMove[] {
      return findBestMoveWith(state, tt);
    },
    ttSize(): number {
      return tt.size;
    },
  };
}
```

**Step 2: Update `solver.reset(p, o)` calls in solver.test.ts**

Search for `solver.reset(` in `tests/engine/solver.test.ts`. There are multiple calls — each one changes from `solver.reset(p, o)` or `solver.reset(cards(), cards())` to `solver.reset()`.

Specific lines to update (line numbers are approximate — verify before editing):
- Line ~237: `solver.reset(p, o);` → `solver.reset();`
- Line ~256: `solver.reset(p, o);` → `solver.reset();`
- Line ~285: `solver.reset(p, o);` → `solver.reset();`
- Line ~300: `solver.reset(p, o);` → `solver.reset();`
- Line ~309: `solver.reset(p, o);` → `solver.reset();`
- Line ~319: `solver.reset(p, o);` → `solver.reset();`
- Line ~335: `solver.reset(p, o);` → `solver.reset();`
- Line ~414: `solver.reset(cards(), cards());` → `solver.reset();`
- In the Task 1 regression test: `solver.reset(p, o);` → `solver.reset();`

**Step 3: Run engine tests**

```bash
bun test tests/engine
```

Expected: ALL tests pass, including the Task 1 regression test (now green).

**Step 4: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/engine/solver.ts tests/engine/solver.test.ts
git commit -m 'feat: use card.id for TT hashing, remove buildCardIndex'
```

---

### Task 4: Update `solver.worker.ts` and `store.ts`

`reset()` no longer needs hand arguments, so the `newGame` Worker message no longer needs to carry hand data.

**Files:**
- Modify: `src/engine/solver.worker.ts`
- Modify: `src/app/store.ts`

**Step 1: Update `solver.worker.ts`**

Change `InMessage` so `newGame` carries no hand data, and update the handler:

```typescript
// ABOUTME: Web Worker entry point for the minimax solver.
// ABOUTME: Maintains a persistent solver instance across turns of a single game.
import { createSolver } from './solver';
import type { GameState, RankedMove } from './types';

type InMessage =
  | { type: 'newGame' }
  | { type: 'solve'; state: GameState };

type OutMessage =
  | { type: 'result'; moves: RankedMove[] };

const solver = createSolver();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'newGame') {
    solver.reset();
  } else if (msg.type === 'solve') {
    const moves = solver.solve(msg.state);
    self.postMessage({ type: 'result', moves } satisfies OutMessage);
  }
};
```

**Step 2: Update `store.ts`**

In `startGame()`, the `postMessage` call drops its hand fields:

```typescript
solverWorker.postMessage({ type: 'newGame' });
```

(Remove `playerHand` and `opponentHand` from that object.)

**Step 3: Run all tests**

```bash
bun run test
```

Expected: All engine tests and app tests pass.

**Step 4: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/engine/solver.worker.ts src/app/store.ts
git commit -m 'refactor: drop hand args from solver reset and newGame worker message'
```

---

### Task 5: Remove `cardEquals` and update components

`cardEquals` was a workaround for the reference-identity loss caused by Worker `postMessage`. With `id` surviving structured clone, callers can use `a.id === b.id` directly.

**Files:**
- Modify: `src/engine/types.ts` (remove `cardEquals`)
- Modify: `src/engine/index.ts` (remove `cardEquals` export)
- Modify: `src/app/components/game/Board.svelte`
- Modify: `src/app/components/game/HandPanel.svelte`
- Modify: `src/app/components/game/SolverPanel.svelte`

**Step 1: Remove `cardEquals` from `types.ts`**

Delete the entire `cardEquals` function (currently near line 77):
```typescript
export function cardEquals(a: Card, b: Card): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left && a.type === b.type;
}
```

**Step 2: Remove `cardEquals` from `index.ts`**

Remove `cardEquals,` from the export list.

**Step 3: Update `Board.svelte`**

Remove `cardEquals` from the import. Replace its two usages with `a.id === b.id`:

```typescript
// Remove from import:
import { Outcome, cardEquals } from '../../../engine';
// Becomes:
import { Outcome } from '../../../engine';
```

Line ~11: `$rankedMoves.find((m) => cardEquals(m.card, selected))` → `$rankedMoves.find((m) => m.card.id === selected.id)`

Line ~20: `if (cardEquals(move.card, selected))` → `if (move.card.id === selected.id)`

**Step 4: Update `HandPanel.svelte`**

Remove `cardEquals` from the import. Replace usage:

Line ~37: `{bestCard && cardEquals(card, bestCard) && isActive ? ...}` → `{bestCard && card.id === bestCard.id && isActive ? ...}`

**Step 5: Update `SolverPanel.svelte`**

Remove `cardEquals` from the import. Replace usage:

Line ~76: `{selectedCard && cardEquals(move.card, selectedCard) ? ...}` → `{selectedCard && move.card.id === selectedCard.id ? ...}`

**Step 6: Run all tests**

```bash
bun run test
```

Expected: All pass.

**Step 7: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

**Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/index.ts \
  src/app/components/game/Board.svelte \
  src/app/components/game/HandPanel.svelte \
  src/app/components/game/SolverPanel.svelte
git commit -m 'refactor: remove cardEquals, use card.id equality in components'
```

---

### Task 6: Update stale test comments and final verification

Several test comments reference `buildCardIndex` or describe the "deserialized source" scenario in terms of the old `cardEquals` workaround. Update them to reflect the current design.

**Files:**
- Modify: `tests/engine/solver.test.ts`
- Modify: `tests/app/components/Board.test.ts`
- Modify: `tests/app/components/HandPanel.test.ts`

**Step 1: Update solver.test.ts comments**

1. The `"solve() returns the same moves as findBestMove()"` test (line ~229) has a comment referencing `buildCardIndex`. Update it:
   - Remove: `// Initial state (no placed cards) ensures buildCardIndex has all cards`
   - Remove: `// — no NaN hashing for board cells in either code path.`
   - Replace with: `// Initial state verified against findBestMove (fresh TT per call).`

2. The `"gives correct outcomes when board contains cards no longer in any hand"` test (line ~270) uses `createSolver` as a reference. Since both paths are now equally correct, simplify: remove the `createSolver` reference entirely, and just verify `findBestMove` returns a non-empty, sorted move list. Or alternatively keep the comparison but update the comment to remove the `buildCardIndex` mention. The simplest correct update:
   - Remove: `// createSolver with reset() correctly indexes all original cards — use as reference`
   - Replace with: `// Verify findBestMove gives correct outcomes from a mid-game starting position.`
   - Keep the comparison against `solver.solve(state)` or simplify to just check the moves are non-empty and sorted.

3. The `"solver self-play consistency"` describe comment at line ~439-443 mentions "the cardIndex / TT-hash bug". Update:
   - Remove: `// — the scenario that exposes the cardIndex / TT-hash bug.`
   - The test still has value as a consistency check; just trim the outdated reference.

**Step 2: Update Board.test.ts comments**

Around line ~80: The comment `// original reference — won't === deserialized move.card` is outdated. Update:
- `// won't === deserialized move.card` → `// id survives JSON round-trip, so card.id equality works`

**Step 3: Update HandPanel.test.ts comments**

The "deserialized source" test (around line ~61) has similar wording. Apply the same update:
- Update the comment to reflect that `id` survives serialization.

**Step 4: Run the full test suite one final time**

```bash
bun run test
```

Expected: All tests green.

**Step 5: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

**Step 6: Final commit**

```bash
git add tests/engine/solver.test.ts \
  tests/app/components/Board.test.ts \
  tests/app/components/HandPanel.test.ts
git commit -m 'docs: update test comments to reflect card.id design'
```
