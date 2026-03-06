# UI Implementation Decisions

Decisions made during design and implementation of the Phase 2 Live Solver UI.

---

## Scope: Live Solver Only, No Router

**Decision:** Phase 2 builds only the Live Game Assistant (PRD §3.2). No navigation shell, no routing, no placeholder screens for Deck Builder or Post-Game Analysis.

**Rejected:** Building a full app shell with routing and empty pillar screens from day one.

**Why:** In Svelte, wrapping an existing view in a navigation shell later is not particularly disruptive — it's mostly adding a layout component. The YAGNI argument is strong: we haven't committed to Pillars 2 and 3, and the retrofit cost is low enough to defer.

---

## Two-Phase App: Setup → Play

**Decision:** The app has two phases controlled by a `phase` store field. `App.svelte` renders either `SetupView` or `GameView` based on this value.

**Rejected:** Unified single view (hands flanking the board, editable in-place), and modal card entry (popovers per slot).

**Why:** Card entry is inherently a form — 10 cards × (4 values + 1 type) = 50 fields. Trying to make that feel natural inside the play view adds layout and UX complexity without payoff. Keeping setup separate means both phases can be clean and focused. The downside (going back to setup to change a card) is minor in practice.

This structure also works for future imperfect-information modes (Three Open, Swap). Three Open just means some opponent card slots are marked "unknown" instead of filled in — an extension to the same setup form, not a different architecture. Swap is a mid-game action handled in the play phase.

---

## Hands as `(Card | null)[]`

**Decision:** The store types hand slots as `(Card | null)[]` even though MVP requires all slots filled.

**Why:** This costs nothing now and avoids a breaking type change when Three Open support is added. The `null` represents an unknown slot — the `CardInput` component emits `null` for incomplete/unknown cards, and the store already validates all slots are non-null before `startGame()` allows a transition to play.

---

## Solver in a Web Worker with Persistent Transposition Table

**Decision:** The solver runs in a dedicated Web Worker (`src/engine/solver.worker.ts`). `rankedMoves` is a `writable` store updated via Worker message results. A `solverLoading` writable tracks in-progress solve requests. `SolverPanel` shows a loading indicator while the Worker is computing.

**Rejected (originally):** Web Worker was initially considered unnecessary. The synchronous `derived` store approach was tried first.

**Why reversed:** Benchmarking with realistic distinct cards (5 unique cards per side) showed the opening-position solve takes ~21 seconds on V8. This freezes the browser UI thread entirely. With all-identical test hands the deduplication in minimax collapses each 5-card hand to 1 unique card, masking the real performance. The 21-second freeze was only discovered after testing with actual card values.

**Web Worker design:** A singleton Worker is created at store module load time. It holds one persistent solver instance created via `createSolver()` (a factory exported from `solver.ts`). The Worker accepts two message types:
- `{ type: 'newGame', playerHand, opponentHand }` — calls `solver.reset()` to clear TT and rebuild card index
- `{ type: 'solve', state }` — calls `solver.solve(state)`, posts back `{ type: 'result', moves }`

**Persistent transposition table:** The TT persists across all turns of a game. The card set (which cards exist, not their board positions) never changes within a game, so TT entries remain valid across turns. `reset()` is called only on new game start, which clears the TT and rebuilds the card index from the full initial hands. This means turn 1 is slow (~21s) but all subsequent turns reuse the TT and complete in <1ms.

**Test strategy:** The Worker is mocked globally in `tests/app/setup.ts`. Component and store tests set `rankedMoves` directly rather than triggering Worker computation. Engine tests (`bun test`) test the solver logic directly without Workers.

---

## Distinct Cards in Performance Tests

**Decision:** Engine solver performance tests use 10 distinct cards (5 unique per side) and a 15-second timeout.

**Rejected:** Using asymmetric hands (player all-10s, opponent all-1s) for performance tests.

**Why:** Identical cards trigger deduplication in minimax, collapsing each 5-card hand to effectively 1 unique card per side. This makes the search nearly instant (~14ms) and useless as a performance regression test. The meaningful question is how long a real game takes, which requires distinct cards. 15 seconds is the observed upper bound for the opening-position solve with fresh TT; subsequent turns are sub-millisecond.

**Store/component tests:** Still use fast asymmetric hands (all-10s vs all-1s) but with the Worker mocked. The asymmetric hands are valid here because these tests exercise store and component behaviour, not solver correctness or performance.

---

## Two Test Runners: Bun + Vitest

**Decision:** Engine tests run on `bun test`. Svelte component and store tests run on Vitest with happy-dom.

**Why:** Svelte component testing requires a DOM environment and Svelte's Vite plugin for `.svelte` file compilation. `@testing-library/svelte` is well-tested against Vitest but has no Bun equivalent. Keeping engine tests on `bun test` avoids adding DOM overhead to pure logic tests, and the two suites don't interfere.

Config: `vite.config.ts` includes Vitest settings (`test.include`, `test.environment`, `test.setupFiles`). A `/// <reference types="vitest/config" />` directive provides type support for the `test` key.

---

## Explicit Vitest Imports (No Globals)

**Decision:** All Vitest tests explicitly import `describe`, `it`, `expect` from `vitest`. The `globals: true` option is not used.

**Rejected:** `globals: true` in `vite.config.ts`, which injects test functions as globals.

**Why:** Explicit imports are consistent with the engine tests (which use `import { test, expect } from 'bun:test'`), reduce implicit coupling, and avoid a subtle issue: `@testing-library/jest-dom` calls `expect.extend(...)` against a global `expect` by default, which fails without `globals: true`. Switching to `@testing-library/jest-dom/vitest` resolves this by using Vitest's own `expect` directly.

---

## Solver Highlights: Best Card and Best Cell

**Decision:** The UI provides two highlight cues: the best-move card in `HandPanel` is highlighted with a ring, and when a card is selected, the best board cell for that card is highlighted in `Board`.

**Why:** These highlights reduce cognitive load — the user can see the solver's recommendation at a glance without reading the full `SolverPanel` list. The card highlight uses identity comparison (`card === rankedMoves[0].card`), which works because hand cards and ranked move cards are the same object references from the same `GameState`.

---

## `startGame` Validates Outside `game.update()`

**Decision:** `startGame()` reads the current store value with `get(game)`, validates that all hand slots are non-null, and throws before calling `game.update()`.

**Why:** Svelte's `writable.update()` swallows errors thrown inside its callback — the error never reaches the caller. By validating outside the update, the thrown error propagates normally, allowing `SetupView` to catch it and display an error message. The store read and subsequent update are not subject to race conditions because JavaScript is single-threaded.
