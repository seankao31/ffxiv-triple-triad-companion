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

## Web Worker Solver with Persistent Transposition Table

**Decision:** The solver runs in a dedicated Web Worker (`src/engine/solver.worker.ts`). `rankedMoves` and `solverLoading` are writable stores updated via Worker messages. The Worker holds a single `Solver` instance (from `createSolver()`) that persists its transposition table across turns of a game.

**Rejected (earlier):** Running `findBestMove` synchronously in a Svelte `derived` store.

**Why the switch:** From a fresh opening position with 10 distinct cards, the solver takes ~21 seconds — blocking the main thread and freezing the UI. Moving to a Worker keeps the UI responsive during the search. Symmetric/identical hands still run in ~14ms via deduplication, so quick positions remain fast.

**Worker protocol:** Two message types:
- `newGame` (sent before `game.update()` in `startGame`): calls `solver.reset(playerHand, opponentHand)` to clear the TT and pre-populate the card index from both full hands.
- `solve` (triggered by the `currentState` subscription): calls `solver.solve(state)` and posts back `{ type: 'result', moves }`.

**Message ordering matters:** `newGame` must be posted before `game.update()` so the Worker's message queue is `[newGame, solve]` — not `[solve (wrong TT), newGame]`. This is because `currentState.subscribe` fires synchronously during `game.update()`.

**TT persistence:** `createSolver()` returns a closure holding its own `tt` (Map) and `cardIndex` (Map). `reset()` reinitializes both; `solve()` accumulates results across calls. The transposition table grows across turns, so positions explored on turn N are cached for free on turn N+1. `ttSize()` exposes TT entry count for test verification.

**Test isolation:** Vitest UI tests mock the Worker globally in `tests/app/setup.ts` (no-op `postMessage`, null `onmessage`). Tests that need solver output populate `rankedMoves` directly via `rankedMoves.set(findBestMove(get(currentState)!))` using asymmetric hands (all-10s vs all-1s) for fast termination.

**Hiccup encountered:** In Vitest's V8 environment, `findBestMove` from a fresh opening position with balanced hands caused the transposition table to exceed the JS `Map` size limit (~16.7M entries). Asymmetric test hands prune almost immediately and avoid this.

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

**Why:** These highlights reduce cognitive load — the user can see the solver's recommendation at a glance without reading the full `SolverPanel` list.

**Card equality via values, not identity:** Move cards in `rankedMoves` are deserialized from the Worker via `postMessage` (structured clone), which creates new object references. Identity comparison (`===`) always returns false. `cardEquals(a, b)` compares all five fields (`top`, `right`, `bottom`, `left`, `type`) and is used in every component that matches a `rankedMoves` card against a hand or selected card: `Board.svelte` (suggestedPosition and evalMap), `HandPanel.svelte` (best-move ring), and `SolverPanel.svelte` (selected-card highlight). Defined in `types.ts`, exported from the engine barrel.

**Test adequacy lesson:** Tests that populate `rankedMoves` with real (non-deserialized) references pass regardless of whether `===` or `cardEquals` is used, giving false confidence. Each component needs a dedicated test that simulates Worker deserialization via `JSON.parse(JSON.stringify(moves))` to catch reference equality regressions.

---

## buildCardIndex Includes Board Cells

**Decision:** `buildCardIndex` in `solver.ts` scans player hand, opponent hand, and all placed board cells when building the card→index mapping for TT hashing.

**Why:** After cards are placed, they are removed from both hands. If only hands are scanned, placed cards get `undefined` from the index, producing `NaN` in the hash. `NaN` keys in a `Map` all collide (Map uses SameValueZero, `NaN === NaN` is true), producing incorrect TT lookups and wrong minimax results for mid-game positions.

**Detection:** The `createSolver` path was not affected (its `reset()` pre-indexes all original hands before any cards are placed). Tests that compared `findBestMove(mid-game)` vs `createSolver.solve(mid-game)` exposed the discrepancy.

---

## `startGame` Validates Outside `game.update()`

---

## `startGame` Validates Outside `game.update()`

**Decision:** `startGame()` reads the current store value with `get(game)`, validates that all hand slots are non-null, and throws before calling `game.update()`.

**Why:** Svelte's `writable.update()` swallows errors thrown inside its callback — the error never reaches the caller. By validating outside the update, the thrown error propagates normally, allowing `SetupView` to catch it and display an error message. The store read and subsequent update are not subject to race conditions because JavaScript is single-threaded.
