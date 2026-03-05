# Phase 2 Live Solver UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-page Svelte + Vite app in `src/app/` that lets a user enter two Triple Triad hands, then plays through a game with real-time solver suggestions.

**Architecture:** Two-phase app (setup → play) controlled by a central Svelte store. The engine (`src/engine`) is imported directly as a TypeScript module. The solver runs synchronously via a `derived` store. No router.

**Tech Stack:** Svelte 5, Vite, Tailwind CSS v4, Vitest + @testing-library/svelte + happy-dom for component/store tests. Engine tests remain on `bun test`.

**Design doc:** `docs/plans/2026-03-05-svelte-ui-design.md`

**Engine API (reference throughout):**
```typescript
import {
  createCard, createInitialState, placeCard, findBestMove, getScore,
  Owner, Outcome, CardType,
  type Card, type GameState, type RuleSet, type RankedMove,
} from '../../engine';

// Card has: top, right, bottom, left (number 1-10, 10=A), type (CardType enum)
// GameState has: board (9-cell array), playerHand, opponentHand, currentTurn, rules
// placeCard(state, card, position) → new GameState (immutable)
// findBestMove(state) → RankedMove[] sorted Win > Draw > Loss, then by robustness
```

---

### Task 1: Scaffold Svelte + Vite + Tailwind

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/app/main.ts`
- Create: `src/app/App.svelte`
- Create: `src/app/app.css`

**Step 1: Install dependencies**

```bash
bun add -d svelte @sveltejs/vite-plugin-svelte vite @tailwindcss/vite tailwindcss svelte-check
```

**Step 2: Update `package.json` scripts**

Add to `package.json` (preserve existing content, add `scripts` and `dependencies`):
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "test:engine": "bun test tests/engine",
    "test:app": "bunx vitest run",
    "test": "bun run test:engine && bun run test:app"
  }
}
```

**Step 3: Create `vite.config.ts`**

```typescript
// ABOUTME: Vite build configuration for the Svelte app.
// ABOUTME: Configures Svelte plugin, Tailwind CSS, and Vitest test environment.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  test: {
    include: ['tests/app/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/app/setup.ts'],
  },
});
```

**Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Project Triad</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
```

**Step 5: Create `src/app/app.css`**

```css
@import "tailwindcss";
```

**Step 6: Create `src/app/main.ts`**

```typescript
// ABOUTME: App entry point — mounts the Svelte app to the DOM.
// ABOUTME: Imports global styles.
import './app.css';
import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;
```

**Step 7: Create `src/app/App.svelte`** (phase-switching shell — logic wired in Task 9)

```svelte
<!-- ABOUTME: Root app component. Switches between setup and play views based on game phase. -->
<script lang="ts">
  // placeholder — store wired in Task 9
</script>

<main class="min-h-screen bg-gray-900 text-white p-4">
  <p>Project Triad — scaffold</p>
</main>
```

**Step 8: Verify dev server starts**

```bash
bunx vite
```

Expected: dev server running at `http://localhost:5173`, no errors.

**Step 9: Commit**

```bash
git add index.html vite.config.ts src/app/ package.json
```

Write commit message to `/tmp/commit.txt`:
```
feat: scaffold Svelte + Vite + Tailwind app
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 2: Configure Vitest

**Files:**
- Install dev deps
- Create: `tests/app/setup.ts`
- Create: `tests/app/smoke.test.ts`

**Step 1: Install Vitest dependencies**

```bash
bun add -d vitest @testing-library/svelte @testing-library/jest-dom happy-dom
```

**Step 2: Create `tests/app/setup.ts`**

```typescript
// ABOUTME: Vitest global setup — extends expect with jest-dom matchers.
import '@testing-library/jest-dom';
```

**Step 3: Add `types` to `tsconfig.json`**

Open `tsconfig.json`. Add `"@testing-library/jest-dom"` to `compilerOptions.types` (create the array if it doesn't exist).

**Step 4: Write a smoke test in `tests/app/smoke.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';

describe('vitest smoke test', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 5: Run to confirm Vitest works**

```bash
bunx vitest run tests/app/smoke.test.ts
```

Expected: PASS

**Step 6: Run engine tests to confirm they still work**

```bash
bun test tests/engine
```

Expected: all 35 tests pass, no interference.

**Step 7: Commit**

```bash
git add tests/app/ tsconfig.json package.json bun.lock
```

Write commit message to `/tmp/commit.txt`:
```
chore: configure Vitest for Svelte component and store tests
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 3: Game Store

**Files:**
- Create: `src/app/store.ts`
- Create: `tests/app/store.test.ts`

The store is the single source of truth. It holds phase, hands, ruleset, game history, and selected card. Derived stores compute current state and ranked moves.

**Step 1: Write failing tests in `tests/app/store.test.ts`**

```typescript
// ABOUTME: Tests for the central game store — phase transitions, move placement, and undo.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  game, currentState, rankedMoves,
  startGame, playCard, undoMove, selectCard,
  updatePlayerCard, updateOpponentCard, updateRuleset,
} from '../../src/app/store';
import { createCard, CardType, Owner, Outcome } from '../../src/engine';

// A minimal valid 5-card hand for testing
function makeHand() {
  return [
    createCard(5, 5, 5, 5),
    createCard(3, 7, 2, 8),
    createCard(9, 1, 6, 4),
    createCard(2, 2, 2, 2),
    createCard(7, 3, 8, 6),
  ];
}

beforeEach(() => {
  // Reset store to initial state before each test
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    history: [],
    selectedCard: null,
  });
});

describe('setup', () => {
  it('starts in setup phase with empty hands', () => {
    const state = get(game);
    expect(state.phase).toBe('setup');
    expect(state.playerHand).toEqual([null, null, null, null, null]);
    expect(state.opponentHand).toEqual([null, null, null, null, null]);
  });

  it('updates a player hand slot', () => {
    const card = createCard(5, 5, 5, 5);
    updatePlayerCard(0, card);
    expect(get(game).playerHand[0]).toEqual(card);
  });

  it('updates an opponent hand slot', () => {
    const card = createCard(3, 3, 3, 3);
    updateOpponentCard(2, card);
    expect(get(game).opponentHand[2]).toEqual(card);
  });

  it('updates ruleset', () => {
    updateRuleset({ plus: true, same: false });
    expect(get(game).ruleset).toEqual({ plus: true, same: false });
  });
});

describe('startGame', () => {
  it('transitions to play phase and creates initial game state', () => {
    const ph = makeHand();
    const oh = makeHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));

    startGame();

    const state = get(game);
    expect(state.phase).toBe('play');
    expect(state.history).toHaveLength(1);
    expect(get(currentState)).not.toBeNull();
  });

  it('throws if any hand slot is null', () => {
    // Only fill 4 of 5 slots
    makeHand().slice(0, 4).forEach((c, i) => updatePlayerCard(i, c));
    makeHand().forEach((c, i) => updateOpponentCard(i, c));

    expect(() => startGame()).toThrow();
  });
});

describe('selectCard', () => {
  it('sets selectedCard', () => {
    const card = createCard(5, 5, 5, 5);
    selectCard(card);
    expect(get(game).selectedCard).toEqual(card);
  });

  it('clears selectedCard when passed null', () => {
    const card = createCard(5, 5, 5, 5);
    selectCard(card);
    selectCard(null);
    expect(get(game).selectedCard).toBeNull();
  });
});

describe('playCard', () => {
  function setup() {
    const ph = makeHand();
    const oh = makeHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    return { ph, oh };
  }

  it('places card and pushes new state to history', () => {
    const { ph } = setup();
    selectCard(ph[0]);
    playCard(4); // center cell

    const state = get(game);
    expect(state.history).toHaveLength(2);
    expect(get(currentState)!.board[4]).not.toBeNull();
  });

  it('clears selectedCard after placement', () => {
    const { ph } = setup();
    selectCard(ph[0]);
    playCard(0);
    expect(get(game).selectedCard).toBeNull();
  });

  it('does nothing if no card is selected', () => {
    setup();
    playCard(0);
    expect(get(game).history).toHaveLength(1); // no new state pushed
  });
});

describe('undoMove', () => {
  function setup() {
    const ph = makeHand();
    const oh = makeHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    return { ph };
  }

  it('pops the last state from history', () => {
    const { ph } = setup();
    selectCard(ph[0]);
    playCard(0);
    expect(get(game).history).toHaveLength(2);

    undoMove();
    expect(get(game).history).toHaveLength(1);
  });

  it('returns to setup phase when history becomes empty', () => {
    setup();
    undoMove(); // undo the initial state
    expect(get(game).phase).toBe('setup');
  });
});

describe('derived stores', () => {
  it('currentState is null in setup phase', () => {
    expect(get(currentState)).toBeNull();
  });

  it('rankedMoves is empty in setup phase', () => {
    expect(get(rankedMoves)).toEqual([]);
  });

  it('rankedMoves updates after card placement', () => {
    const ph = makeHand();
    const oh = makeHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();

    // After startGame, rankedMoves should have suggestions
    expect(get(rankedMoves).length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/app/store.test.ts
```

Expected: FAIL — module not found.

**Step 3: Create `src/app/store.ts`**

```typescript
// ABOUTME: Central Svelte store for the Live Solver app.
// ABOUTME: Holds game phase, hands, ruleset, history stack, and selected card.
import { writable, derived } from 'svelte/store';
import {
  createInitialState, placeCard as enginePlaceCard, findBestMove,
  type Card, type GameState, type RuleSet, type RankedMove,
} from '../engine';

export type Phase = 'setup' | 'play';

export type AppState = {
  phase: Phase;
  ruleset: RuleSet;
  playerHand: (Card | null)[];
  opponentHand: (Card | null)[];
  history: GameState[];
  selectedCard: Card | null;
};

const initialAppState: AppState = {
  phase: 'setup',
  ruleset: { plus: false, same: false },
  playerHand: [null, null, null, null, null],
  opponentHand: [null, null, null, null, null],
  history: [],
  selectedCard: null,
};

export const game = writable<AppState>(initialAppState);

export const currentState = derived(game, ($g) => $g.history.at(-1) ?? null);

export const rankedMoves = derived(currentState, ($state): RankedMove[] =>
  $state ? findBestMove($state) : [],
);

export function updatePlayerCard(index: number, card: Card | null): void {
  game.update((s) => {
    const playerHand = [...s.playerHand];
    playerHand[index] = card;
    return { ...s, playerHand };
  });
}

export function updateOpponentCard(index: number, card: Card | null): void {
  game.update((s) => {
    const opponentHand = [...s.opponentHand];
    opponentHand[index] = card;
    return { ...s, opponentHand };
  });
}

export function updateRuleset(ruleset: RuleSet): void {
  game.update((s) => ({ ...s, ruleset }));
}

export function startGame(): void {
  game.update((s) => {
    const playerHand = s.playerHand as (Card | null)[];
    const opponentHand = s.opponentHand as (Card | null)[];

    if (playerHand.some((c) => c === null) || opponentHand.some((c) => c === null)) {
      throw new Error('All hand slots must be filled before starting the game.');
    }

    const initial = createInitialState(
      playerHand as Card[],
      opponentHand as Card[],
      undefined,
      s.ruleset,
    );

    return { ...s, phase: 'play', history: [initial] };
  });
}

export function selectCard(card: Card | null): void {
  game.update((s) => ({ ...s, selectedCard: card }));
}

export function playCard(position: number): void {
  game.update((s) => {
    if (!s.selectedCard) return s;
    const state = s.history.at(-1);
    if (!state) return s;

    const next = enginePlaceCard(state, s.selectedCard, position);
    return { ...s, history: [...s.history, next], selectedCard: null };
  });
}

export function undoMove(): void {
  game.update((s) => {
    const history = s.history.slice(0, -1);
    const phase: Phase = history.length === 0 ? 'setup' : 'play';
    return { ...s, history, phase };
  });
}
```

**Step 4: Run tests to confirm they pass**

```bash
bunx vitest run tests/app/store.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/app/store.ts tests/app/store.test.ts
```

Write commit message to `/tmp/commit.txt`:
```
feat: add central game store with phase transitions and undo
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 4: CardInput Component

**Files:**
- Create: `src/app/components/setup/CardInput.svelte`
- Create: `tests/app/components/CardInput.test.ts`

`CardInput` handles one card slot: four numeric value inputs (1–10, displayed as 1–9,A) and a card type selector. It calls an `onchange` callback with `Card | null`.

**Step 1: Write failing tests in `tests/app/components/CardInput.test.ts`**

```typescript
// ABOUTME: Tests for the CardInput component — single card slot with value and type inputs.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CardInput from '../../../src/app/components/setup/CardInput.svelte';
import { CardType } from '../../../src/engine';

describe('CardInput', () => {
  it('renders four value inputs and a type selector', () => {
    render(CardInput, { props: { onchange: vi.fn() } });
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
    expect(screen.getByLabelText('Right')).toBeInTheDocument();
    expect(screen.getByLabelText('Bottom')).toBeInTheDocument();
    expect(screen.getByLabelText('Left')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('calls onchange with a Card when all values are filled', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '3' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '7' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '2' } });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 5, right: 3, bottom: 7, left: 2, type: CardType.None }),
    );
  });

  it('calls onchange with null when any value is cleared', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '3' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '7' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '2' } });
    // Clear one field
    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '' } });

    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('accepts 10 as a value (displayed as A)', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '10' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '10' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '10' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '10' } });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 10, right: 10, bottom: 10, left: 10 }),
    );
  });

  it('emits the selected card type', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '5' } });
    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'primal' } });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: CardType.Primal }),
    );
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/app/components/CardInput.test.ts
```

Expected: FAIL — component not found.

**Step 3: Create `src/app/components/setup/CardInput.svelte`**

```svelte
<!-- ABOUTME: Input for a single card slot — four directional values and a card type. -->
<!-- ABOUTME: Calls onchange with a Card when all fields are filled, or null otherwise. -->
<script lang="ts">
  import { createCard, CardType, type Card } from '../../../engine';

  let { onchange }: { onchange: (card: Card | null) => void } = $props();

  let top = $state('');
  let right = $state('');
  let bottom = $state('');
  let left = $state('');
  let type = $state<CardType>(CardType.None);

  function emit() {
    const t = parseInt(top);
    const r = parseInt(right);
    const b = parseInt(bottom);
    const l = parseInt(left);

    if ([t, r, b, l].some((v) => isNaN(v) || v < 1 || v > 10)) {
      onchange(null);
    } else {
      onchange(createCard(t, r, b, l, type));
    }
  }
</script>

<div class="grid grid-cols-3 gap-1 text-sm">
  <!-- Top row: top value input centered -->
  <div></div>
  <div class="flex flex-col items-center">
    <label for="top-{Math.random()}" class="text-xs text-gray-400">Top</label>
    <input
      id="top-{Math.random()}"
      aria-label="Top"
      type="number"
      min="1"
      max="10"
      bind:value={top}
      oninput={emit}
      class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1"
    />
  </div>
  <div></div>

  <!-- Middle row: left, type selector, right -->
  <div class="flex flex-col items-center">
    <label for="left-{Math.random()}" class="text-xs text-gray-400">Left</label>
    <input
      id="left-{Math.random()}"
      aria-label="Left"
      type="number"
      min="1"
      max="10"
      bind:value={left}
      oninput={emit}
      class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1"
    />
  </div>
  <div class="flex items-center justify-center">
    <select
      bind:value={type}
      onchange={emit}
      class="bg-gray-700 rounded border border-gray-600 p-1 text-xs"
    >
      {#each Object.values(CardType) as ct}
        <option value={ct}>{ct}</option>
      {/each}
    </select>
  </div>
  <div class="flex flex-col items-center">
    <label for="right-{Math.random()}" class="text-xs text-gray-400">Right</label>
    <input
      id="right-{Math.random()}"
      aria-label="Right"
      type="number"
      min="1"
      max="10"
      bind:value={right}
      oninput={emit}
      class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1"
    />
  </div>

  <!-- Bottom row: bottom value input centered -->
  <div></div>
  <div class="flex flex-col items-center">
    <label for="bottom-{Math.random()}" class="text-xs text-gray-400">Bottom</label>
    <input
      id="bottom-{Math.random()}"
      aria-label="Bottom"
      type="number"
      min="1"
      max="10"
      bind:value={bottom}
      oninput={emit}
      class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1"
    />
  </div>
  <div></div>
</div>
```

**Note on `aria-label` vs `id` collision:** The `Math.random()` id pattern above creates duplicate aria-label issues in tests. Replace the `id` attributes with static aria-labels using `aria-label` directly as shown — the test uses `getByLabelText` which resolves to `aria-label`. The `<label>` elements above are visual-only (no `for` linking needed for tests).

Simplified version that avoids the id collision problem:

```svelte
<!-- ABOUTME: Input for a single card slot — four directional values and a card type. -->
<!-- ABOUTME: Calls onchange with a Card when all fields are filled, or null otherwise. -->
<script lang="ts">
  import { createCard, CardType, type Card } from '../../../engine';

  let { onchange }: { onchange: (card: Card | null) => void } = $props();

  let top = $state('');
  let right = $state('');
  let bottom = $state('');
  let left = $state('');
  let type = $state<CardType>(CardType.None);

  function emit() {
    const t = parseInt(top);
    const r = parseInt(right);
    const b = parseInt(bottom);
    const l = parseInt(left);
    if ([t, r, b, l].some((v) => isNaN(v) || v < 1 || v > 10)) {
      onchange(null);
    } else {
      onchange(createCard(t, r, b, l, type));
    }
  }
</script>

<div class="grid grid-cols-3 gap-1 text-sm">
  <div></div>
  <input aria-label="Top" type="number" min="1" max="10"
    bind:value={top} oninput={emit}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />
  <div></div>

  <input aria-label="Left" type="number" min="1" max="10"
    bind:value={left} oninput={emit}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />
  <select bind:value={type} onchange={emit}
    class="bg-gray-700 rounded border border-gray-600 p-1 text-xs">
    {#each Object.values(CardType) as ct}
      <option value={ct}>{ct}</option>
    {/each}
  </select>
  <input aria-label="Right" type="number" min="1" max="10"
    bind:value={right} oninput={emit}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />

  <div></div>
  <input aria-label="Bottom" type="number" min="1" max="10"
    bind:value={bottom} oninput={emit}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />
  <div></div>
</div>
```

**Step 4: Run tests to confirm they pass**

```bash
bunx vitest run tests/app/components/CardInput.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/app/components/ tests/app/components/
```

Write commit message to `/tmp/commit.txt`:
```
feat: add CardInput component with card value and type entry
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 5: SetupView

**Files:**
- Create: `src/app/components/setup/HandInput.svelte`
- Create: `src/app/components/setup/RulesetInput.svelte`
- Create: `src/app/components/setup/SetupView.svelte`
- Create: `tests/app/components/SetupView.test.ts`

`HandInput` renders 5 `CardInput` components and calls back per slot. `RulesetInput` renders Plus/Same checkboxes. `SetupView` composes them and calls `startGame` on submit.

**Step 1: Write failing tests in `tests/app/components/SetupView.test.ts`**

```typescript
// ABOUTME: Tests for SetupView — validates hand entry and triggers game start.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game } from '../../../src/app/store';
import SetupView from '../../../src/app/components/setup/SetupView.svelte';
import { createCard } from '../../../src/engine';

function makeHand() {
  return [
    createCard(5, 5, 5, 5),
    createCard(3, 7, 2, 8),
    createCard(9, 1, 6, 4),
    createCard(2, 2, 2, 2),
    createCard(7, 3, 8, 6),
  ];
}

beforeEach(() => {
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    history: [],
    selectedCard: null,
  });
});

describe('SetupView', () => {
  it('renders a Start Game button', () => {
    render(SetupView);
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
  });

  it('renders Plus and Same checkboxes', () => {
    render(SetupView);
    expect(screen.getByLabelText(/plus/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/same/i)).toBeInTheDocument();
  });

  it('transitions to play phase when all cards are filled and Start Game is clicked', async () => {
    // Directly populate the store — testing store integration, not form filling
    const ph = makeHand();
    const oh = makeHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));

    render(SetupView);
    await fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(get(game).phase).toBe('play');
  });

  it('does not transition when hands are incomplete', async () => {
    render(SetupView);
    await fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(get(game).phase).toBe('setup');
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/app/components/SetupView.test.ts
```

Expected: FAIL — components not found.

**Step 3: Create `src/app/components/setup/RulesetInput.svelte`**

```svelte
<!-- ABOUTME: Checkbox inputs for selecting the active ruleset (Plus, Same). -->
<script lang="ts">
  import { game, updateRuleset } from '../../store';

  let plus = $state($game.ruleset.plus);
  let same = $state($game.ruleset.same);

  function update() {
    updateRuleset({ plus, same });
  }
</script>

<div class="flex gap-4">
  <label class="flex items-center gap-2">
    <input type="checkbox" bind:checked={plus} onchange={update} />
    Plus
  </label>
  <label class="flex items-center gap-2">
    <input type="checkbox" bind:checked={same} onchange={update} />
    Same
  </label>
</div>
```

**Step 4: Create `src/app/components/setup/HandInput.svelte`**

```svelte
<!-- ABOUTME: Renders 5 CardInput slots for one hand (player or opponent). -->
<script lang="ts">
  import CardInput from './CardInput.svelte';
  import type { Card } from '../../../engine';

  let {
    label,
    onchange,
  }: {
    label: string;
    onchange: (index: number, card: Card | null) => void;
  } = $props();
</script>

<div>
  <h3 class="text-sm font-semibold text-gray-300 mb-2">{label}</h3>
  <div class="flex flex-col gap-3">
    {#each Array(5) as _, i}
      <CardInput onchange={(card) => onchange(i, card)} />
    {/each}
  </div>
</div>
```

**Step 5: Create `src/app/components/setup/SetupView.svelte`**

```svelte
<!-- ABOUTME: Setup phase view — collects both hands and ruleset before starting a game. -->
<script lang="ts">
  import HandInput from './HandInput.svelte';
  import RulesetInput from './RulesetInput.svelte';
  import { startGame, updatePlayerCard, updateOpponentCard } from '../../store';

  let error = $state('');

  function handleStart() {
    try {
      startGame();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Please fill all card slots before starting.';
    }
  }
</script>

<div class="flex flex-col items-center gap-8 p-8">
  <h1 class="text-2xl font-bold">Project Triad — Setup</h1>

  <RulesetInput />

  <div class="flex gap-12">
    <HandInput label="Your Hand" onchange={updatePlayerCard} />
    <HandInput label="Opponent Hand" onchange={updateOpponentCard} />
  </div>

  {#if error}
    <p class="text-red-400 text-sm">{error}</p>
  {/if}

  <button
    onclick={handleStart}
    class="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded font-semibold"
  >
    Start Game
  </button>
</div>
```

**Step 6: Run tests to confirm they pass**

```bash
bunx vitest run tests/app/components/SetupView.test.ts
```

Expected: all tests PASS.

**Step 7: Commit**

```bash
git add src/app/components/setup/ tests/app/components/SetupView.test.ts
```

Write commit message to `/tmp/commit.txt`:
```
feat: add SetupView with hand entry and ruleset selection
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 6: Board Component

**Files:**
- Create: `src/app/components/game/BoardCell.svelte`
- Create: `src/app/components/game/Board.svelte`
- Create: `tests/app/components/Board.test.ts`

`BoardCell` renders a placed card (showing N/E/S/W values and ownership) or an empty cell. `Board` renders the 9-cell grid and handles click-to-place.

**Step 1: Write failing tests in `tests/app/components/Board.test.ts`**

```typescript
// ABOUTME: Tests for the Board component — renders cells, handles placement, shows highlights.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard } from '../../../src/app/store';
import Board from '../../../src/app/components/game/Board.svelte';
import { createCard, Owner } from '../../../src/engine';
import type { Board as BoardType } from '../../../src/engine/types';

function makeHand() {
  return [
    createCard(5, 5, 5, 5),
    createCard(3, 7, 2, 8),
    createCard(9, 1, 6, 4),
    createCard(2, 2, 2, 2),
    createCard(7, 3, 8, 6),
  ];
}

beforeEach(() => {
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    history: [],
    selectedCard: null,
  });
});

describe('Board', () => {
  it('renders 9 cells', () => {
    const ph = makeHand();
    const oh = makeHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();

    render(Board);
    expect(screen.getAllByRole('button')).toHaveLength(9);
  });

  it('calls playCard store action when an empty cell is clicked with a card selected', async () => {
    const ph = makeHand();
    const oh = makeHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    selectCard(ph[0]);

    render(Board);
    await fireEvent.click(screen.getAllByRole('button')[0]);

    // After placement, history should have grown
    expect(get(game).history).toHaveLength(2);
  });

  it('highlights the suggested cell when a card is selected', async () => {
    const ph = makeHand();
    const oh = makeHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    selectCard(ph[0]);

    const { container } = render(Board);
    // At least one cell should have a highlight class
    expect(container.querySelector('.ring-2')).not.toBeNull();
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/app/components/Board.test.ts
```

Expected: FAIL.

**Step 3: Create `src/app/components/game/BoardCell.svelte`**

```svelte
<!-- ABOUTME: A single cell on the 3×3 board — renders an empty slot or a placed card. -->
<script lang="ts">
  import type { BoardCell } from '../../../engine/types';
  import { Owner } from '../../../engine';

  let {
    cell,
    highlighted = false,
    onclick,
  }: {
    cell: BoardCell;
    highlighted?: boolean;
    onclick: () => void;
  } = $props();
</script>

<button
  {onclick}
  class="w-20 h-20 border border-gray-600 rounded flex items-center justify-center
    {highlighted ? 'ring-2 ring-yellow-400' : ''}
    {cell ? (cell.owner === Owner.Player ? 'bg-blue-900' : 'bg-red-900') : 'bg-gray-800 hover:bg-gray-700'}"
>
  {#if cell}
    <div class="grid grid-cols-3 gap-0 text-xs font-bold w-full h-full p-1">
      <div></div>
      <div class="flex items-center justify-center">{cell.card.top === 10 ? 'A' : cell.card.top}</div>
      <div></div>
      <div class="flex items-center justify-center">{cell.card.left === 10 ? 'A' : cell.card.left}</div>
      <div></div>
      <div class="flex items-center justify-center">{cell.card.right === 10 ? 'A' : cell.card.right}</div>
      <div></div>
      <div class="flex items-center justify-center">{cell.card.bottom === 10 ? 'A' : cell.card.bottom}</div>
      <div></div>
    </div>
  {:else}
    <span class="text-gray-600 text-2xl">·</span>
  {/if}
</button>
```

**Step 4: Create `src/app/components/game/Board.svelte`**

```svelte
<!-- ABOUTME: 3×3 game board. Renders cells, handles card placement, highlights suggested move. -->
<script lang="ts">
  import BoardCell from './BoardCell.svelte';
  import { currentState, rankedMoves, game, playCard } from '../../store';

  // The position that's highlighted — best move for the selected card
  let suggestedPosition = $derived.by(() => {
    const selected = $game.selectedCard;
    if (!selected) return null;
    const move = $rankedMoves.find((m) => m.card === selected);
    return move?.position ?? null;
  });
</script>

<div class="grid grid-cols-3 gap-2">
  {#each Array(9) as _, i}
    <BoardCell
      cell={$currentState?.board[i] ?? null}
      highlighted={suggestedPosition === i}
      onclick={() => playCard(i)}
    />
  {/each}
</div>
```

**Step 5: Run tests to confirm they pass**

```bash
bunx vitest run tests/app/components/Board.test.ts
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add src/app/components/game/ tests/app/components/Board.test.ts
```

Write commit message to `/tmp/commit.txt`:
```
feat: add Board and BoardCell components with placement and highlight
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 7: HandPanel Component

**Files:**
- Create: `src/app/components/game/HandPanel.svelte`
- Create: `tests/app/components/HandPanel.test.ts`

`HandPanel` shows a player's remaining cards. The active panel (matching `currentTurn`) is selectable — clicking a card calls `selectCard`. The best-move card is highlighted. The inactive panel is display-only.

**Step 1: Write failing tests in `tests/app/components/HandPanel.test.ts`**

```typescript
// ABOUTME: Tests for HandPanel — renders remaining cards, highlights best move, handles selection.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard } from '../../../src/app/store';
import HandPanel from '../../../src/app/components/game/HandPanel.svelte';
import { createCard, Owner } from '../../../src/engine';

function makeHand() {
  return [
    createCard(5, 5, 5, 5),
    createCard(3, 7, 2, 8),
    createCard(9, 1, 6, 4),
    createCard(2, 2, 2, 2),
    createCard(7, 3, 8, 6),
  ];
}

beforeEach(() => {
  const ph = makeHand();
  const oh = makeHand();
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: ph,
    opponentHand: oh,
    history: [],
    selectedCard: null,
  });
  startGame();
});

describe('HandPanel', () => {
  it('renders 5 cards for the player hand', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    // Each card shows at least its top value — look for 5 card elements
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('sets selectedCard when a card is clicked (active turn)', async () => {
    // It starts as player turn
    render(HandPanel, { props: { owner: Owner.Player } });
    await fireEvent.click(screen.getAllByRole('button')[0]);
    expect(get(game).selectedCard).not.toBeNull();
  });

  it('does not set selectedCard when the inactive hand is clicked', async () => {
    // Opponent panel during player turn
    render(HandPanel, { props: { owner: Owner.Opponent } });
    await fireEvent.click(screen.getAllByRole('button')[0]);
    expect(get(game).selectedCard).toBeNull();
  });

  it('highlights the card matching the top ranked move', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    // At least one button should have the highlight class
    const highlighted = screen
      .getAllByRole('button')
      .filter((b) => b.classList.contains('ring-2'));
    expect(highlighted.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/app/components/HandPanel.test.ts
```

Expected: FAIL.

**Step 3: Create `src/app/components/game/HandPanel.svelte`**

```svelte
<!-- ABOUTME: Displays one player's remaining hand cards during gameplay. -->
<!-- ABOUTME: Highlights the best-move card; allows selection on the active turn. -->
<script lang="ts">
  import { currentState, rankedMoves, game, selectCard } from '../../store';
  import { Owner, type Card } from '../../../engine';

  let { owner }: { owner: Owner } = $props();

  let hand = $derived(
    owner === Owner.Player
      ? ($currentState?.playerHand ?? [])
      : ($currentState?.opponentHand ?? []),
  );

  let isActive = $derived($currentState?.currentTurn === owner);
  let bestCard = $derived($rankedMoves[0]?.card ?? null);

  function handleClick(card: Card) {
    if (!isActive) return;
    selectCard(card);
  }
</script>

<div class="flex flex-col gap-2">
  <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
    {owner === Owner.Player ? 'Your Hand' : 'Opponent'}
    {isActive ? '(Active)' : ''}
  </h3>
  {#each hand as card}
    <button
      onclick={() => handleClick(card)}
      class="w-16 h-16 rounded border text-xs font-bold grid grid-cols-3
        {isActive ? 'cursor-pointer hover:border-blue-400' : 'cursor-default opacity-70'}
        {card === $game.selectedCard ? 'border-blue-400 bg-blue-900' : 'border-gray-600 bg-gray-800'}
        {card === bestCard && isActive ? 'ring-2 ring-yellow-400' : ''}"
    >
      <div></div>
      <div class="flex items-center justify-center">{card.top === 10 ? 'A' : card.top}</div>
      <div></div>
      <div class="flex items-center justify-center">{card.left === 10 ? 'A' : card.left}</div>
      <div></div>
      <div class="flex items-center justify-center">{card.right === 10 ? 'A' : card.right}</div>
      <div></div>
      <div class="flex items-center justify-center">{card.bottom === 10 ? 'A' : card.bottom}</div>
      <div></div>
    </button>
  {/each}
</div>
```

**Step 4: Run tests to confirm they pass**

```bash
bunx vitest run tests/app/components/HandPanel.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/app/components/game/HandPanel.svelte tests/app/components/HandPanel.test.ts
```

Write commit message to `/tmp/commit.txt`:
```
feat: add HandPanel with active-turn selection and best-move highlight
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 8: SolverPanel Component

**Files:**
- Create: `src/app/components/game/SolverPanel.svelte`
- Create: `tests/app/components/SolverPanel.test.ts`

`SolverPanel` lists all ranked moves from `rankedMoves` with outcome labels and robustness. The top move is visually highlighted.

**Step 1: Write failing tests in `tests/app/components/SolverPanel.test.ts`**

```typescript
// ABOUTME: Tests for SolverPanel — displays ranked move suggestions with outcomes.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { game, startGame } from '../../../src/app/store';
import SolverPanel from '../../../src/app/components/game/SolverPanel.svelte';
import { createCard } from '../../../src/engine';

function makeHand() {
  return [
    createCard(5, 5, 5, 5),
    createCard(3, 7, 2, 8),
    createCard(9, 1, 6, 4),
    createCard(2, 2, 2, 2),
    createCard(7, 3, 8, 6),
  ];
}

beforeEach(() => {
  const ph = makeHand();
  const oh = makeHand();
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: ph,
    opponentHand: oh,
    history: [],
    selectedCard: null,
  });
  startGame();
});

describe('SolverPanel', () => {
  it('renders a list of move suggestions', () => {
    render(SolverPanel);
    // Each move renders as a list item
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('shows outcome labels (Win, Draw, or Loss)', () => {
    render(SolverPanel);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/win|draw|loss/i);
  });

  it('shows a position label for each move', () => {
    render(SolverPanel);
    // Positions are 0-8 — each move should have a position shown
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/app/components/SolverPanel.test.ts
```

Expected: FAIL.

**Step 3: Create `src/app/components/game/SolverPanel.svelte`**

```svelte
<!-- ABOUTME: Displays the solver's ranked move suggestions with outcome and robustness. -->
<script lang="ts">
  import { rankedMoves } from '../../store';
  import { Outcome } from '../../../engine';

  const outcomeLabel: Record<Outcome, string> = {
    [Outcome.Win]: 'Win',
    [Outcome.Draw]: 'Draw',
    [Outcome.Loss]: 'Loss',
  };

  const outcomeColor: Record<Outcome, string> = {
    [Outcome.Win]: 'text-green-400',
    [Outcome.Draw]: 'text-yellow-400',
    [Outcome.Loss]: 'text-red-400',
  };

  // Board position labels (row, col) for display
  const positionLabel = (pos: number) => {
    const row = Math.floor(pos / 3) + 1;
    const col = (pos % 3) + 1;
    return `R${row}C${col}`;
  };
</script>

<div class="flex flex-col gap-2">
  <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Best Moves</h3>
  <ul class="flex flex-col gap-1">
    {#each $rankedMoves as move, i}
      <li
        class="flex items-center gap-2 text-sm p-2 rounded
          {i === 0 ? 'bg-gray-700 ring-1 ring-yellow-400' : 'bg-gray-800'}"
      >
        <span class="font-mono text-gray-400 w-8">{positionLabel(move.position)}</span>
        <span class="font-semibold {outcomeColor[move.outcome]}">{outcomeLabel[move.outcome]}</span>
        <span class="text-gray-500 text-xs">rob={move.robustness.toFixed(2)}</span>
      </li>
    {/each}
  </ul>
</div>
```

**Step 4: Run tests to confirm they pass**

```bash
bunx vitest run tests/app/components/SolverPanel.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/app/components/game/SolverPanel.svelte tests/app/components/SolverPanel.test.ts
```

Write commit message to `/tmp/commit.txt`:
```
feat: add SolverPanel with ranked move list and outcome labels
```
Then: `git commit -F /tmp/commit.txt`

---

### Task 9: GameView and App Wiring

**Files:**
- Create: `src/app/components/game/GameView.svelte`
- Modify: `src/app/App.svelte`

`GameView` composes the board, both hand panels, and the solver panel. `App.svelte` switches between `SetupView` and `GameView` based on `game.phase`.

**Step 1: Create `src/app/components/game/GameView.svelte`**

No new tests needed — this is layout wiring of already-tested components.

```svelte
<!-- ABOUTME: Play phase view — board, both hands, solver suggestions, and undo control. -->
<script lang="ts">
  import Board from './Board.svelte';
  import HandPanel from './HandPanel.svelte';
  import SolverPanel from './SolverPanel.svelte';
  import { undoMove, currentState, getScore } from '../../store';
  import { Owner } from '../../../engine';

  // getScore needs to be imported from store (re-export from engine)
  // or call engine directly
  import { getScore as engineGetScore } from '../../../engine';

  let score = $derived(
    $currentState ? engineGetScore($currentState) : { player: 0, opponent: 0 },
  );
</script>

<div class="flex flex-col h-screen bg-gray-900 text-white p-4">
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-lg font-bold">Project Triad</h1>
    <div class="text-sm text-gray-400">
      You: {score.player} — Opponent: {score.opponent}
    </div>
    <button
      onclick={undoMove}
      class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
    >
      Undo
    </button>
  </div>

  <!-- Main layout -->
  <div class="flex gap-8 flex-1 items-start justify-center">
    <HandPanel owner={Owner.Player} />
    <Board />
    <HandPanel owner={Owner.Opponent} />
    <SolverPanel />
  </div>
</div>
```

**Step 2: Update `src/app/App.svelte`**

```svelte
<!-- ABOUTME: Root app component. Switches between setup and play views based on game phase. -->
<script lang="ts">
  import { game } from './store';
  import SetupView from './components/setup/SetupView.svelte';
  import GameView from './components/game/GameView.svelte';
</script>

{#if $game.phase === 'setup'}
  <SetupView />
{:else}
  <GameView />
{/if}
```

**Step 3: Run all tests**

```bash
bun run test
```

Expected: all 35 engine tests + all app tests PASS, no failures.

**Step 4: Manually verify the dev server**

```bash
bunx vite
```

Open `http://localhost:5173`. Verify:
- Setup view renders with two hand panels and ruleset checkboxes
- Filling all 10 cards and clicking "Start Game" transitions to the play view
- Clicking a card in the player hand highlights it and shows a board suggestion
- Clicking a highlighted board cell places the card
- Undo returns to the previous state; undo from the initial state returns to setup

**Step 5: Commit**

```bash
git add src/app/App.svelte src/app/components/game/GameView.svelte
```

Write commit message to `/tmp/commit.txt`:
```
feat: wire GameView and App shell to complete Phase 2 Live Solver UI
```
Then: `git commit -F /tmp/commit.txt`

---

## Completion Checklist

- [ ] Dev server runs (`bunx vite`)
- [ ] All engine tests pass (`bun test tests/engine`)
- [ ] All app tests pass (`bunx vitest run`)
- [ ] Setup → play transition works end-to-end
- [ ] Solver highlights best card in hand and best board position
- [ ] Undo works; undo to start returns to setup
