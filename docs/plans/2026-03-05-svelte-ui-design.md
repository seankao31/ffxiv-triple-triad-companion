# Phase 2 Live Solver UI — Design

## Scope

Single-view Live Game Assistant (PRD §3.2). No router, no other pillars. The Deck Builder and Post-Game Analysis features are out of scope for this phase.

## App Structure and Phases

The app has two phases controlled by a `phase` field in the central store: `'setup'` and `'play'`. `App.svelte` renders either `SetupView` or `GameView` based on this value — no router, just a conditional render.

Transitioning setup → play creates the initial `GameState` via `createInitialState` and pushes it onto the history stack. Undoing back to an empty history stack returns the app to `'setup'`.

## Component Tree

```
App.svelte
├── SetupView.svelte          — phase: 'setup'
│   ├── RulesetInput.svelte   — checkboxes for Plus, Same, Reverse, Fallen Ace, Ascension, Descension
│   ├── HandInput.svelte      — player hand (5 × CardInput)
│   ├── HandInput.svelte      — opponent hand (5 × CardInput)
│   └── [Start Game button]
└── GameView.svelte           — phase: 'play'
    ├── Board.svelte          — 3×3 grid
    │   └── BoardCell.svelte  — empty or placed card
    ├── HandPanel.svelte      — player's remaining cards (selectable)
    ├── HandPanel.svelte      — opponent's remaining cards (display only)
    └── SolverPanel.svelte    — ranked move suggestions
```

`CardInput.svelte` handles a single card slot: four value fields (N/E/S/W, values 1–A) plus a type selector. It emits `Card | null` — null for unknown slots. This is the only component that needs to change to support Three Open.

## State Management

A single Svelte writable store holds all app state:

```typescript
type GameStore = {
  phase: 'setup' | 'play';
  ruleset: RuleSet;
  playerHand: (Card | null)[];   // 5 slots; null = unknown
  opponentHand: (Card | null)[]; // 5 slots; null = unknown
  history: GameState[];          // history[0] = initial, history[n-1] = current
  selectedCard: Card | null;     // card selected from hand for placement
};
```

`rankedMoves` is a Svelte `writable` store updated via a dedicated Web Worker (`src/engine/solver.worker.ts`). `solverLoading` is a writable that tracks in-progress solves. The Worker holds a single `Solver` instance (from `createSolver()`) that persists its transposition table across turns, so positions explored on turn N are cached for free on turn N+1.

**Worker protocol:**
- `newGame` — sent before `game.update()` in `startGame`; calls `solver.reset()` to clear the TT.
- `solve` — triggered by the `currentState` subscription; posts back `{ type: 'result', moves }`.

Message ordering matters: `newGame` must be posted before `game.update()` so the Worker queue is `[newGame, solve]`, not `[solve (stale TT), newGame]`. `solverWorker.onerror` resets `solverLoading` and surfaces crashes so the UI is never permanently blocked.

Data flow is unidirectional: user action → store mutation → Worker message → `rankedMoves.set()` → components re-render. No prop drilling beyond passing a card or position to a leaf component.

## Play Interaction

1. Player clicks a card in their `HandPanel` → sets `selectedCard` in the store.
2. Player clicks an empty `BoardCell` → dispatches `(selectedCard, position)` → `placeCard` is called → new `GameState` pushed to `history` → `rankedMoves` updates.
3. Opponent's turn: user manually places the opponent's card the same way. `GameState.currentTurn` tracks whose turn it is; the active `HandPanel` is visually distinguished.
4. Undo button: pops `history`. If the stack reaches 0, phase returns to `'setup'`.

### Solver Highlights

- `HandPanel` compares each card against `rankedMoves[0].card` and highlights the best-move card.
- `Board` finds the top-ranked move in `rankedMoves` where `move.card === selectedCard` and highlights that cell when a card is selected.
- `SolverPanel` lists all ranked moves with card name, target position, outcome (Win/Draw/Loss), and robustness score. The top suggestion is visually highlighted.

## Extensibility Notes

- **Partial information (Three Open):** `(Card | null)[]` hand types are already in the store. Adding unknown-slot support to `CardInput` is an isolated change.
- **Swap and mid-game reveals:** handled in the play phase by allowing the user to update the board state when an unknown card is revealed. The setup form does not need special Swap handling — users enter the post-swap hand state as they see it.
- **PIMC solver:** when the probabilistic solver is added, it will use the known hand contents to constrain unknown-slot sampling. No UI changes needed.

## Tech Stack

| Concern | Tool |
|---------|------|
| Framework | Svelte + Vite |
| Styling | Tailwind CSS |
| Engine | `src/engine` (TypeScript, imported directly) |
| App location | `src/app/` |

## Testing

| Layer | Tool |
|-------|------|
| Engine | `bun test` (existing, unchanged) |
| Svelte components | Vitest + `@testing-library/svelte` + happy-dom |
| Store logic | Vitest (plain TypeScript, no DOM) |

Component tests cover: `CardInput` emits correct `Card | null`; `Board` renders placed cards correctly; `HandPanel` highlights the correct card. Store tests cover: setup → play transition, undo behavior, `selectedCard` updates.

No E2E tests for MVP.
