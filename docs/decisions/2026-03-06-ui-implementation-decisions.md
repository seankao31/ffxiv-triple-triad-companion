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

## Synchronous Solver in a Derived Store

**Decision:** `rankedMoves` is a Svelte `derived` store that calls `findBestMove(currentState)` synchronously whenever the game state changes.

**Rejected:** Web Worker, async computation, or debounced solver.

**Why:** The minimax solver with alpha-beta pruning and transposition table is fast enough for real-time use in a browser (sub-second for most mid-game positions). Moving to a Web Worker adds message-passing complexity, serialization overhead, and async UI states — all unnecessary at current performance levels. The derived store keeps the data flow simple and reactive. If performance becomes an issue (e.g., with PIMC for imperfect info), the solver call can be moved to a Worker without touching any component.

**Hiccup encountered:** In Vitest's V8 environment, calling `findBestMove` from a fresh opening position with balanced hands (similar card values) caused the transposition table to exceed the JS `Map` size limit (~16.7M entries). The solver performance is fine in Bun's runtime but the V8 environment used by Vitest is slower and the balanced hands produce a flat search tree with minimal pruning. Solved by using asymmetric test hands (player all-10s, opponent all-1s) in store and component tests — these prune almost immediately. The tests verify store behaviour, not solver correctness, so any cards that terminate fast are appropriate.

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
