# Phase 2 UI Improvements Design

## Overview

Post-launch feedback on the Phase 2 Live Solver UI. Six improvements addressing theme, setup UX, gameplay clarity, and solver interaction.

## 1. Theme & Styling

**Problem:** Setup page has a white background (dark theme not applied). Overall palette is bland gray.

**Solution:**
- Apply a dark gray-purple palette across the entire app (both setup and game views)
- Use the frontend-design skill for the detailed color system
- Minimalistic, clean aesthetic — no ornamental elements
- Game view components can be rendered larger for readability

## 2. Card-Shaped Setup Inputs with Auto-Advance

**Problem:** The cross-shaped input fields without a card border are hard to read. Manual tabbing between 40 fields is tedious.

**Solution:**
- Render each card input as a card-shaped container with a visible border
- 4 value inputs in a cross layout (top/right/bottom/left)
- Type dropdown positioned at the top-right corner of each card
- Single-character input: 1-9 for face value, "A" or "0" for 10
- Auto-advance on valid keypress: top -> right -> bottom -> left -> next card's top
- Advance flows across cards within a hand, then across hands (player card 5 -> opponent card 1)
- Type dropdown skipped in the auto-advance flow

## 3. First Move Selection

**Problem:** Player always goes first. No way to configure who starts.

**Solution:**
- Add a radio/toggle in setup: "Who goes first? You / Opponent"
- Pass `firstTurn` to `createInitialState` (engine already supports this parameter)

## 4. Solver Panel — Opponent Turn Clarity

**Problem:** "Best Moves" list is confusing when it's the opponent's turn. Win/Draw/Loss labels are from the opponent's perspective.

**Solution:**
- Change header to "Opponent's Best Moves" when it's the opponent's turn
- Add a tooltip on the header explaining: outcomes are from the current player's perspective (their "Win" = your loss)

## 5. Card Info in Move List

**Problem:** Move list only shows position (R1C2), not which card to play.

**Solution:**
- Each move row shows card values as compact text: `7-3-A-2` (top-right-bottom-left)
- When card type is not None, append a colored type indicator in brackets: `7-3-A-2[P]`
- Type indicator colors match FFXIV: Primal=red, Scion=yellow, Society=green, Garlean=blue
- This establishes a pure text move notation usable elsewhere

## 6. Per-Card Board Evaluation

**Problem:** Player can only follow the solver's top suggestion. No way to explore "what if I play this other card?"

**Solution:**
- When player selects any card from their hand, all empty board cells show a color-coded outcome overlay for placing that card there
- Overlay colors use shades distinct from the player-blue / opponent-red ownership colors:
  - Win: bright green tint
  - Draw: amber/yellow tint
  - Loss: muted pink/magenta tint (not red, to avoid confusion with opponent ownership)
- Best cell for the selected card gets the existing highlight ring
- SolverPanel highlights entries matching the selected card with a distinct accent (e.g., blue/purple border, different from the yellow "overall best" ring)
- When no card is selected, board shows no overlays (current behavior)

## Engine Changes

None required for features 1–6. `findBestMove` already returns all card+position combos with outcomes. The UI filters by selected card.

## Store Changes

- Add `firstTurn: Owner` to `AppState` (defaults to `Owner.Player`)
- `startGame` passes `firstTurn` to `createInitialState`

---

## Post-Implementation Issues (discovered during testing)

Four bugs/regressions identified after the initial implementation was complete.

### 7. CardInput Type Dropdown Overlap

**Problem:** The type dropdown (`w-14`, absolutely positioned `top-1 right-1`) overlaps the Top and Right number input fields inside the `w-28 h-28` card container. The inputs are unreadable when the dropdown is visible.

**Solution:** Increase the card container size so the dropdown has room without overlapping the cross layout. Target size: `w-36 h-36`. Adjust internal spacing accordingly.

### 8. Browser Freeze on Game Start

**Problem:** The browser UI thread blocks for ~21 seconds after clicking "Start Game" while `findBestMove` runs synchronously from the opening position with distinct (real) cards. The minimax search tree from turn 1 is enormous — alpha-beta pruning with a fresh transposition table provides little help on the first call.

**Root cause:** `findBestMove` creates a fresh `Map` transposition table on every invocation. From the opening position with 5 unique cards per hand (no deduplication benefit), the full tree takes ~21 seconds on V8.

**Note:** This freeze was masked during development because tests used asymmetric hands (all-10s player, all-1s opponent). Identical cards collapse to 1 unique card per side via deduplication, making the search effectively instant (~14ms).

### 9. Browser Freeze on Card Click / Undo

**Problem:** Clicking a card or pressing Undo also freezes the browser for several seconds. This is not from per-card evaluation (which only filters existing `rankedMoves` data). The freeze comes from `playCard` and `undo` triggering `currentState` to change, which re-runs `findBestMove` synchronously via the `derived` store.

**Same root cause as #8.** Turn 2 and later positions are fast (<1ms) because the transposition table built during turn 1 is reused — but only within a single `findBestMove` call. When the `derived` store re-runs from scratch on the new state, a fresh TT is created and the search is slower.

**Key insight:** The card set never changes within a game. A TT entry is valid as long as the same cards are in play. Only a new game (different card configuration) requires a fresh TT.

### 10. Distinct Cards Required in Tests

**Problem:** Using identical asymmetric hands (all-10s vs all-1s) in component and store tests masked the true solver performance. Tests should use distinct realistic card sets to catch performance regressions and correctness issues.

**Solution:** Update engine performance tests to use 10 distinct cards (5 per side) with a realistic timeout (15 seconds). Update store/component tests to also use distinct cards, but mock the Worker so solver calls don't run in the test environment.

---

## Engine Changes (revised — issues 8–9)

`solver.ts` requires refactoring to support a persistent transposition table:

- Export a `createSolver()` factory that returns a solver instance with a persistent TT
- The instance exposes `solve(state: GameState): RankedMove[]` (same logic as `findBestMove`)
- `reset(playerHand: Card[], opponentHand: Card[])` builds a fresh cardIndex from the full initial hands and clears the TT — called when a new game starts
- The existing `findBestMove(state)` export is kept for engine tests (it always creates a fresh TT)

## Store Changes (revised — issues 8–9)

The solver runs in a Web Worker to keep the UI thread responsive:

- `rankedMoves` changes from a `derived` store to `writable<RankedMove[]>` (initially `[]`)
- Add `solverLoading: writable<boolean>` (initially `false`)
- A singleton Worker is created at module load time (`src/engine/solver.worker.ts`)
- Worker messages:
  - `{ type: 'newGame', playerHand: Card[], opponentHand: Card[] }` → calls `solver.reset()`
  - `{ type: 'solve', state: GameState }` → calls `solver.solve()`, posts back `{ type: 'result', moves: RankedMove[] }`
- `startGame()` posts `newGame` then immediately posts `solve` for the opening state
- `currentState` is subscribed; on change, posts `solve` for the new state
- On `result` message: `rankedMoves.set(moves)`, `solverLoading.set(false)`

## Type Icon Reference

Card type icons from FFXIV (for future use when rendering actual icons):
- Primal: red symbol
- Scion: yellow symbol
- Society: green symbol
- Garlean: blue symbol

For now, use colored text indicators: `[P]` red, `[Sc]` yellow, `[So]` green, `[G]` blue.
