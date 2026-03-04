# Triple Triad Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a pure TypeScript game engine for FFXIV Triple Triad with a minimax solver that provides ranked move suggestions.

**Architecture:** Engine-first — a standalone TypeScript library with no UI dependencies. Immutable state, pure functions, TDD throughout. Three modules: types (data model), board (game logic), solver (minimax AI).

**Tech Stack:** TypeScript (strict), Bun runtime, `bun test`

**Reference:** See `docs/plans/2026-03-04-triple-triad-engine-design.md` for full design context.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `tsconfig.json`
- Create: `package.json`
- Create: `src/engine/types.ts`
- Create: `src/engine/board.ts`
- Create: `src/engine/solver.ts`
- Create: `src/engine/index.ts`
- Create: `tests/engine/board.test.ts`
- Create: `tests/engine/solver.test.ts`

**Step 1: Initialize Bun project**

Run: `bun init -y`

This creates `package.json`, `tsconfig.json`, and some boilerplate.

**Step 2: Configure TypeScript strict mode**

Edit `tsconfig.json` to ensure `"strict": true` is set. Remove any generated boilerplate files that aren't needed (e.g., `index.ts` at root).

**Step 3: Create directory structure**

```bash
mkdir -p src/engine tests/engine
```

**Step 4: Create placeholder files**

Create empty placeholder files so imports work as we build up:

`src/engine/types.ts`:
```typescript
// ABOUTME: Core data types for the Triple Triad game engine.
// ABOUTME: Defines Card, BoardCell, GameState, and related enums.
```

`src/engine/board.ts`:
```typescript
// ABOUTME: Game logic for card placement and capture resolution.
// ABOUTME: Handles standard capture, Plus, Same, and Combo cascades.
```

`src/engine/solver.ts`:
```typescript
// ABOUTME: Minimax solver with alpha-beta pruning for move optimization.
// ABOUTME: Provides ranked move suggestions with win/draw/loss outcomes.
```

`src/engine/index.ts`:
```typescript
// ABOUTME: Public API barrel export for the Triple Triad engine.
// ABOUTME: Re-exports types, board logic, and solver functions.
```

`tests/engine/board.test.ts`:
```typescript
// ABOUTME: Tests for game logic — card placement, captures, combos.
// ABOUTME: Covers standard, Plus, Same, and Combo cascade rules.
```

`tests/engine/solver.test.ts`:
```typescript
// ABOUTME: Tests for the minimax solver — move ranking, tie-breaking.
// ABOUTME: Covers forced wins, loss avoidance, and robustness scoring.
```

**Step 5: Verify setup**

Run: `bun test`
Expected: 0 tests found, no errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold project structure"
```

---

### Task 2: Core Types

**Files:**
- Modify: `src/engine/types.ts`

**Step 1: Define all types**

```typescript
export enum CardType {
  None = "none",
  Primal = "primal",
  Scion = "scion",
  Society = "society",
  Garlean = "garlean",
}

export enum Owner {
  Player = "player",
  Opponent = "opponent",
}

export interface Card {
  readonly top: number;    // 1-10, where 10 = A
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly type: CardType;
}

export interface PlacedCard {
  readonly card: Card;
  readonly owner: Owner;
}

export type BoardCell = PlacedCard | null;

// 3x3 board, row-major: [0,1,2] = top row, [3,4,5] = middle, [6,7,8] = bottom
export type Board = readonly [
  BoardCell, BoardCell, BoardCell,
  BoardCell, BoardCell, BoardCell,
  BoardCell, BoardCell, BoardCell,
];

export interface GameState {
  readonly board: Board;
  readonly playerHand: readonly Card[];
  readonly opponentHand: readonly Card[];
  readonly currentTurn: Owner;
}

export interface RankedMove {
  readonly card: Card;
  readonly position: number;       // 0-8 board index
  readonly outcome: Outcome;
  readonly robustness: number;     // fraction of opponent responses that lose for them (0-1)
}

export enum Outcome {
  Win = "win",
  Draw = "draw",
  Loss = "loss",
}

// Adjacency: for each board position, the neighbors and which card edge faces them
export interface Neighbor {
  readonly position: number;
  readonly attackingEdge: "top" | "right" | "bottom" | "left";
  readonly defendingEdge: "top" | "right" | "bottom" | "left";
}
```

**Step 2: Add helper functions for creating game states**

```typescript
export function createCard(
  top: number,
  right: number,
  bottom: number,
  left: number,
  type: CardType = CardType.None,
): Card {
  return { top, right, bottom, left, type };
}

export function createInitialState(
  playerHand: readonly Card[],
  opponentHand: readonly Card[],
): GameState {
  return {
    board: [null, null, null, null, null, null, null, null, null],
    playerHand,
    opponentHand,
    currentTurn: Owner.Player,
  };
}

export function getScore(state: GameState): { player: number; opponent: number } {
  let player = state.playerHand.length;
  let opponent = state.opponentHand.length;
  for (const cell of state.board) {
    if (cell) {
      if (cell.owner === Owner.Player) player++;
      else opponent++;
    }
  }
  return { player, opponent };
}
```

**Step 3: Add adjacency map**

This is a static lookup table. For each board position (0-8), list neighbors with which edges face each other.

```typescript
// When a card at `position` attacks in direction `attackingEdge`,
// it hits the neighbor at `position` on their `defendingEdge`.
// e.g., position 0's "right" edge attacks position 1's "left" edge.
export const ADJACENCY: readonly Neighbor[][] = [
  /* 0 */ [{ position: 1, attackingEdge: "right", defendingEdge: "left" }, { position: 3, attackingEdge: "bottom", defendingEdge: "top" }],
  /* 1 */ [{ position: 0, attackingEdge: "left", defendingEdge: "right" }, { position: 2, attackingEdge: "right", defendingEdge: "left" }, { position: 4, attackingEdge: "bottom", defendingEdge: "top" }],
  /* 2 */ [{ position: 1, attackingEdge: "left", defendingEdge: "right" }, { position: 5, attackingEdge: "bottom", defendingEdge: "top" }],
  /* 3 */ [{ position: 0, attackingEdge: "top", defendingEdge: "bottom" }, { position: 4, attackingEdge: "right", defendingEdge: "left" }, { position: 6, attackingEdge: "bottom", defendingEdge: "top" }],
  /* 4 */ [{ position: 1, attackingEdge: "top", defendingEdge: "bottom" }, { position: 3, attackingEdge: "left", defendingEdge: "right" }, { position: 5, attackingEdge: "right", defendingEdge: "left" }, { position: 7, attackingEdge: "bottom", defendingEdge: "top" }],
  /* 5 */ [{ position: 2, attackingEdge: "top", defendingEdge: "bottom" }, { position: 4, attackingEdge: "left", defendingEdge: "right" }, { position: 8, attackingEdge: "bottom", defendingEdge: "top" }],
  /* 6 */ [{ position: 3, attackingEdge: "top", defendingEdge: "bottom" }, { position: 7, attackingEdge: "right", defendingEdge: "left" }],
  /* 7 */ [{ position: 6, attackingEdge: "left", defendingEdge: "right" }, { position: 8, attackingEdge: "right", defendingEdge: "left" }, { position: 4, attackingEdge: "top", defendingEdge: "bottom" }],
  /* 8 */ [{ position: 7, attackingEdge: "left", defendingEdge: "right" }, { position: 5, attackingEdge: "top", defendingEdge: "bottom" }],
];
```

**Step 4: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat: add core types and adjacency map"
```

---

### Task 3: Card Placement (No Captures)

**Files:**
- Modify: `src/engine/board.ts`
- Modify: `tests/engine/board.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test";
import { createCard, createInitialState, Owner, CardType } from "../../src/engine/types";
import { placeCard } from "../../src/engine/board";

describe("placeCard", () => {
  it("places a card on an empty cell", () => {
    const card = createCard(1, 2, 3, 4);
    const playerHand = [card, createCard(5, 5, 5, 5), createCard(3, 3, 3, 3), createCard(2, 2, 2, 2), createCard(1, 1, 1, 1)];
    const opponentHand = [createCard(4, 4, 4, 4), createCard(6, 6, 6, 6), createCard(7, 7, 7, 7), createCard(8, 8, 8, 8), createCard(9, 9, 9, 9)];
    const state = createInitialState(playerHand, opponentHand);

    const newState = placeCard(state, card, 0);

    expect(newState.board[0]).toEqual({ card, owner: Owner.Player });
    expect(newState.playerHand).not.toContain(card);
    expect(newState.playerHand).toHaveLength(4);
    expect(newState.currentTurn).toBe(Owner.Opponent);
  });

  it("throws when placing on an occupied cell", () => {
    const card = createCard(1, 2, 3, 4);
    const card2 = createCard(5, 5, 5, 5);
    const playerHand = [card, card2, createCard(3, 3, 3, 3), createCard(2, 2, 2, 2), createCard(1, 1, 1, 1)];
    const opponentHand = [createCard(4, 4, 4, 4), createCard(6, 6, 6, 6), createCard(7, 7, 7, 7), createCard(8, 8, 8, 8), createCard(9, 9, 9, 9)];
    const state = createInitialState(playerHand, opponentHand);

    const stateWithCard = placeCard(state, card, 0);
    expect(() => placeCard(stateWithCard, card2, 0)).toThrow();
  });

  it("throws when placing a card not in the current player's hand", () => {
    const card = createCard(1, 2, 3, 4);
    const playerHand = [createCard(5, 5, 5, 5), createCard(3, 3, 3, 3), createCard(2, 2, 2, 2), createCard(1, 1, 1, 1), createCard(9, 9, 9, 9)];
    const opponentHand = [createCard(4, 4, 4, 4), createCard(6, 6, 6, 6), createCard(7, 7, 7, 7), createCard(8, 8, 8, 8), createCard(9, 9, 9, 9)];
    const state = createInitialState(playerHand, opponentHand);

    expect(() => placeCard(state, card, 0)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/engine/board.test.ts`
Expected: FAIL — `placeCard` is not exported.

**Step 3: Write minimal implementation**

In `src/engine/board.ts`:

```typescript
import { type Card, type GameState, type Board, Owner } from "./types";

export function placeCard(state: GameState, card: Card, position: number): GameState {
  if (position < 0 || position > 8) {
    throw new Error(`Invalid position: ${position}`);
  }
  if (state.board[position] !== null) {
    throw new Error(`Cell ${position} is already occupied`);
  }

  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;
  const cardIndex = hand.indexOf(card);
  if (cardIndex === -1) {
    throw new Error("Card is not in the current player's hand");
  }

  const newBoard = [...state.board] as unknown as [
    ...Board
  ];
  newBoard[position] = { card, owner: state.currentTurn };

  const newHand = [...hand.slice(0, cardIndex), ...hand.slice(cardIndex + 1)];

  return {
    board: newBoard as unknown as Board,
    playerHand: state.currentTurn === Owner.Player ? newHand : state.playerHand,
    opponentHand: state.currentTurn === Owner.Opponent ? newHand : state.opponentHand,
    currentTurn: state.currentTurn === Owner.Player ? Owner.Opponent : Owner.Player,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/engine/board.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/engine/board.ts tests/engine/board.test.ts
git commit -m "feat: card placement without captures"
```

---

### Task 4: Standard Capture

**Files:**
- Modify: `src/engine/board.ts`
- Modify: `tests/engine/board.test.ts`

**Step 1: Write the failing tests**

Add to `tests/engine/board.test.ts`:

```typescript
describe("standard capture", () => {
  it("captures an adjacent opponent card when value is higher", () => {
    // Place opponent card with top=1, then player card below it with top=5
    // Player card at position 4 (center), opponent card at position 1 (top-center)
    // Player's bottom edge doesn't face opponent — player at 4, opponent at 1: player's top vs opponent's bottom
    const opponentCard = createCard(1, 1, 1, 1); // low values
    const playerCard = createCard(5, 5, 5, 5);    // high values

    const opponentHand = [opponentCard, createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(7, 7, 7, 7), createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10)];
    let state = createInitialState(playerHand, opponentHand);

    // Player places dummy at position 0 to pass turn
    const dummyCard = playerHand[1];
    state = placeCard(state, dummyCard, 0);

    // Opponent places low card at position 1
    state = placeCard(state, opponentCard, 1);

    // Player places high card at position 4 (center) — top edge (5) > opponent's bottom edge (1)
    state = placeCard(state, playerCard, 4);

    // Opponent's card at position 1 should now be owned by Player
    expect(state.board[1]!.owner).toBe(Owner.Player);
  });

  it("does not capture when value is equal", () => {
    const opponentCard = createCard(5, 5, 5, 5);
    const playerCard = createCard(5, 5, 5, 5);

    const opponentHand = [opponentCard, createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(7, 7, 7, 7), createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10)];
    let state = createInitialState(playerHand, opponentHand);

    const dummyCard = playerHand[1];
    state = placeCard(state, dummyCard, 0);
    state = placeCard(state, opponentCard, 1);
    state = placeCard(state, playerCard, 4);

    // Equal values — no capture
    expect(state.board[1]!.owner).toBe(Owner.Opponent);
  });

  it("does not capture own cards", () => {
    const card1 = createCard(1, 1, 1, 1);
    const card2 = createCard(5, 5, 5, 5);

    const playerHand = [card1, card2, createCard(3, 3, 3, 3), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const opponentHand = [createCard(2, 2, 2, 2), createCard(7, 7, 7, 7), createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10)];
    let state = createInitialState(playerHand, opponentHand);

    // Player places card1 at 0
    state = placeCard(state, card1, 0);
    // Opponent places at 2
    state = placeCard(state, opponentHand[0], 2);
    // Player places card2 at 1 (adjacent to card1 at 0) — should NOT capture own card
    state = placeCard(state, card2, 1);

    expect(state.board[0]!.owner).toBe(Owner.Player);
  });

  it("captures multiple adjacent opponent cards", () => {
    const opponentCard1 = createCard(1, 1, 1, 1);
    const opponentCard2 = createCard(1, 1, 1, 1);
    const playerCard = createCard(5, 5, 5, 5);

    const opponentHand = [opponentCard1, opponentCard2, createCard(3, 3, 3, 3), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(7, 7, 7, 7), createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10)];
    let state = createInitialState(playerHand, opponentHand);

    // Player dummy at 0
    state = placeCard(state, playerHand[1], 0);
    // Opponent at 1 (top center)
    state = placeCard(state, opponentCard1, 1);
    // Player dummy at 2
    state = placeCard(state, playerHand[2], 2);
    // Opponent at 3 (middle left)
    state = placeCard(state, opponentCard2, 3);
    // Player places high card at 4 (center) — captures both at 1 (top) and 3 (left)
    state = placeCard(state, playerCard, 4);

    expect(state.board[1]!.owner).toBe(Owner.Player);
    expect(state.board[3]!.owner).toBe(Owner.Player);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/engine/board.test.ts`
Expected: FAIL — captures not implemented yet.

**Step 3: Implement standard capture in `placeCard`**

After placing the card on the board, add capture resolution. Update `src/engine/board.ts`:

```typescript
import { type Card, type GameState, type Board, type PlacedCard, Owner, ADJACENCY } from "./types";

function resolveStandardCaptures(
  board: PlacedCard[],  // mutable working copy, null positions filtered out
  position: number,
  attacker: Owner,
): void {
  // (implementation uses ADJACENCY to check each neighbor)
  // For each neighbor: if occupied by opposite owner and attacker's edge > defender's edge, flip owner
}
```

Integrate into `placeCard`: after placing the card, call `resolveStandardCaptures` on the mutable board copy, then freeze into the new GameState.

The core comparison per neighbor:
```typescript
const attackerCard = board[position]!.card;
const attackValue = attackerCard[neighbor.attackingEdge];
const defenderCard = board[neighbor.position]!.card;
const defendValue = defenderCard[neighbor.defendingEdge];
if (defendValue < attackValue) {
  // flip
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/engine/board.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/engine/board.ts tests/engine/board.test.ts
git commit -m "feat: standard capture resolution"
```

---

### Task 5: Same Rule

**Files:**
- Modify: `src/engine/board.ts`
- Modify: `tests/engine/board.test.ts`

**Step 1: Write the failing tests**

```typescript
describe("same rule", () => {
  it("captures when two or more adjacent pairs have equal touching values", () => {
    // Set up: opponent cards at positions 1 and 3, player places at 4
    // Position 4 top-edge == position 1 bottom-edge AND position 4 left-edge == position 3 right-edge
    const opponentCard1 = createCard(1, 1, 7, 1); // bottom = 7
    const opponentCard2 = createCard(1, 3, 1, 1); // right = 3
    const playerCard = createCard(7, 1, 1, 3);    // top = 7, left = 3 → matches!

    // Build a game state where opponent has cards at 1 and 3, player places at 4
    const opponentHand = [opponentCard1, opponentCard2, createCard(2, 2, 2, 2), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10), createCard(5, 5, 5, 5)];
    let state = createInitialState(playerHand, opponentHand);

    // Player dummy at 0
    state = placeCard(state, playerHand[1], 0);
    // Opponent places at 1
    state = placeCard(state, opponentCard1, 1);
    // Player dummy at 2
    state = placeCard(state, playerHand[2], 2);
    // Opponent places at 3
    state = placeCard(state, opponentCard2, 3);
    // Player places at 4 — Same triggers on both neighbors
    state = placeCard(state, playerCard, 4);

    expect(state.board[1]!.owner).toBe(Owner.Player);
    expect(state.board[3]!.owner).toBe(Owner.Player);
  });

  it("does not trigger same with only one matching pair", () => {
    // Only one adjacent pair matches — Same requires 2+
    const opponentCard = createCard(1, 1, 7, 1); // bottom = 7
    const playerCard = createCard(7, 1, 1, 1);   // top = 7 → one match only

    const opponentHand = [opponentCard, createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10), createCard(5, 5, 5, 5)];
    let state = createInitialState(playerHand, opponentHand);

    state = placeCard(state, playerHand[1], 0);
    state = placeCard(state, opponentCard, 1);
    // Player places at 4 — only one match, Same doesn't trigger
    // (standard capture also doesn't apply since 7 == 7, not >)
    state = placeCard(state, playerCard, 4);

    expect(state.board[1]!.owner).toBe(Owner.Opponent);
  });

  it("counts friendly cards toward same pairs but does not capture them", () => {
    // Player card at 0, opponent card at 1, player places at 3
    // Position 3's top-edge matches position 0's bottom-edge (friendly — counts but no flip)
    // Position 3's right-edge matches position 4... wait, let's set up position 1 instead
    // Better setup: player card at 1, opponent card at 3, player places at 4
    const playerCard1 = createCard(1, 1, 7, 1);   // bottom = 7 (at position 1)
    const opponentCard = createCard(1, 3, 1, 1);   // right = 3 (at position 3)
    const playerCard2 = createCard(7, 1, 1, 3);    // top = 7 matches pos 1, left = 3 matches pos 3

    const opponentHand = [opponentCard, createCard(2, 2, 2, 2), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6), createCard(5, 5, 5, 5)];
    const playerHand = [playerCard1, playerCard2, createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10)];
    let state = createInitialState(playerHand, opponentHand);

    // Player places at 1
    state = placeCard(state, playerCard1, 1);
    // Opponent places at 3
    state = placeCard(state, opponentCard, 3);
    // Player dummy at 0
    state = placeCard(state, opponentHand[1], 0);
    // skip — we need to get back to player's turn
    // Actually, let's restructure: after player at 1 and opponent at 3, it's player's turn again
    // Player places at 4 — Same triggers (2 pairs: friendly at 1 + opponent at 3)
    state = placeCard(state, playerCard2, 4);

    // Opponent card at 3 captured
    expect(state.board[3]!.owner).toBe(Owner.Player);
    // Player card at 1 was NOT flipped (it's already player's)
    expect(state.board[1]!.owner).toBe(Owner.Player);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/engine/board.test.ts`
Expected: FAIL — Same rule not implemented.

**Step 3: Implement Same rule**

Add a `resolveSameCaptures` function in `src/engine/board.ts`. For the placed card, check all adjacent occupied cells. Collect pairs where the touching values are equal. If 2+ pairs match, flip any opponent-owned cards among them.

Call this BEFORE standard capture in `placeCard`. Return the list of flipped positions (needed for combo in Task 7).

**Step 4: Run test to verify it passes**

Run: `bun test tests/engine/board.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/board.ts tests/engine/board.test.ts
git commit -m "feat: same rule capture"
```

---

### Task 6: Plus Rule

**Files:**
- Modify: `src/engine/board.ts`
- Modify: `tests/engine/board.test.ts`

**Step 1: Write the failing tests**

```typescript
describe("plus rule", () => {
  it("captures when two or more adjacent pairs have equal sums", () => {
    // Position 4 center, neighbors at 1 (top) and 3 (left)
    // Plus: placed_card.top + neighbor_1.bottom == placed_card.left + neighbor_3.right
    // Player card: top=3, left=6. Opponent at 1: bottom=5 (sum=8). Opponent at 3: right=2 (sum=8).
    const opponentCard1 = createCard(1, 1, 5, 1); // bottom = 5
    const opponentCard2 = createCard(1, 2, 1, 1); // right = 2
    const playerCard = createCard(3, 1, 1, 6);    // top=3 + bottom(5)=8, left=6 + right(2)=8

    const opponentHand = [opponentCard1, opponentCard2, createCard(2, 2, 2, 2), createCard(4, 4, 4, 4), createCard(9, 9, 9, 9)];
    const playerHand = [playerCard, createCard(8, 8, 8, 8), createCard(7, 7, 7, 7), createCard(10, 10, 10, 10), createCard(5, 5, 5, 5)];
    let state = createInitialState(playerHand, opponentHand);

    state = placeCard(state, playerHand[1], 0);
    state = placeCard(state, opponentCard1, 1);
    state = placeCard(state, playerHand[2], 2);
    state = placeCard(state, opponentCard2, 3);
    state = placeCard(state, playerCard, 4);

    expect(state.board[1]!.owner).toBe(Owner.Player);
    expect(state.board[3]!.owner).toBe(Owner.Player);
  });

  it("does not trigger plus with only one pair", () => {
    const opponentCard = createCard(1, 1, 5, 1); // bottom = 5
    const playerCard = createCard(3, 1, 1, 1);   // top=3 + 5=8, only one pair

    const opponentHand = [opponentCard, createCard(2, 2, 2, 2), createCard(3, 3, 3, 3), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10), createCard(5, 5, 5, 5)];
    let state = createInitialState(playerHand, opponentHand);

    state = placeCard(state, playerHand[1], 0);
    state = placeCard(state, opponentCard, 1);
    state = placeCard(state, playerCard, 4);

    // No plus trigger, and standard doesn't apply (3 < 5)
    expect(state.board[1]!.owner).toBe(Owner.Opponent);
  });

  it("counts friendly cards toward plus pairs but does not capture them", () => {
    // Similar to Same — friendly card contributes to the sum match but isn't flipped
    const playerCard1 = createCard(1, 1, 5, 1);   // bottom = 5 (at position 1)
    const opponentCard = createCard(1, 2, 1, 1);   // right = 2 (at position 3)
    const playerCard2 = createCard(3, 1, 1, 6);    // top=3+5=8, left=6+2=8

    const opponentHand = [opponentCard, createCard(2, 2, 2, 2), createCard(4, 4, 4, 4), createCard(9, 9, 9, 9), createCard(7, 7, 7, 7)];
    const playerHand = [playerCard1, playerCard2, createCard(8, 8, 8, 8), createCard(10, 10, 10, 10), createCard(5, 5, 5, 5)];
    let state = createInitialState(playerHand, opponentHand);

    state = placeCard(state, playerCard1, 1);
    state = placeCard(state, opponentCard, 3);
    state = placeCard(state, playerCard2, 4);

    expect(state.board[3]!.owner).toBe(Owner.Player);
    expect(state.board[1]!.owner).toBe(Owner.Player); // not flipped, still player's
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/engine/board.test.ts`
Expected: FAIL

**Step 3: Implement Plus rule**

Add `resolvePlusCaptures` in `src/engine/board.ts`. For the placed card, check all adjacent occupied cells. Compute the sum of touching values for each pair. Group by sum. If any sum group has 2+ pairs, flip opponent-owned cards in those groups.

Call this BEFORE Same in `placeCard`. Return flipped positions for combo.

**Step 4: Run test to verify it passes**

Run: `bun test tests/engine/board.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/board.ts tests/engine/board.test.ts
git commit -m "feat: plus rule capture"
```

---

### Task 7: Combo Cascades

**Files:**
- Modify: `src/engine/board.ts`
- Modify: `tests/engine/board.test.ts`

**Step 1: Write the failing tests**

```typescript
describe("combo cascade", () => {
  it("flipped cards from Same trigger standard captures on their neighbors", () => {
    // Setup:
    // Position 0: opponent card (low values)
    // Position 1: opponent card (bottom = 7, left has low value like 1)
    // Position 4: player places card triggering Same at positions 1 and 3
    // After Same flips position 1 to player, position 1's left (value=high) should
    // standard-capture position 0 (opponent, right=low)
    //
    // Positions: 0(opp, right=1), 1(opp, bottom=7, left=9), 3(opp, right=3), 4(player, top=7, left=3)
    // Same triggers: top+bottom match, left+right match → flips 1 and 3
    // Combo: flipped card at 1 has left=9, neighbor at 0 has right=1 → 9 > 1 → capture!
    const opp0 = createCard(1, 1, 1, 1);
    const opp1 = createCard(1, 1, 7, 9); // bottom=7, left=9
    const opp3 = createCard(1, 3, 1, 1); // right=3
    const playerCard = createCard(7, 1, 1, 3); // top=7, left=3

    const opponentHand = [opp0, opp1, opp3, createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(8, 8, 8, 8), createCard(10, 10, 10, 10), createCard(5, 5, 5, 5), createCard(2, 2, 2, 2)];
    let state = createInitialState(playerHand, opponentHand);

    // Set up board: opponent cards at 0, 1, 3
    state = placeCard(state, playerHand[1], 8); // player dummy at 8
    state = placeCard(state, opp0, 0);
    state = placeCard(state, playerHand[2], 6); // player dummy at 6
    state = placeCard(state, opp1, 1);
    state = placeCard(state, playerHand[3], 2); // player dummy at 2
    state = placeCard(state, opp3, 3);

    // Player places at 4 — Same triggers on 1 and 3, then combo from 1 captures 0
    state = placeCard(state, playerCard, 4);

    expect(state.board[1]!.owner).toBe(Owner.Player); // Same capture
    expect(state.board[3]!.owner).toBe(Owner.Player); // Same capture
    expect(state.board[0]!.owner).toBe(Owner.Player); // Combo capture
  });

  it("combo does NOT re-trigger Plus or Same", () => {
    // Set up a scenario where a combo-flipped card would trigger Same if Same were allowed
    // But since combo only does standard captures, it should NOT trigger Same again
    // This test verifies that a card flipped by combo doesn't trigger Plus/Same
    //
    // Position layout:
    // 0(opp) 1(opp) 2
    // 3(opp) 4(plr) 5
    //
    // Same at 4 flips 1 and 3
    // Combo: flipped card at 1 checks neighbors. Position 0 is adjacent.
    // If card at 1 and card at 0 happen to create a Same condition... it should NOT trigger.
    // Standard capture only.
    const opp0 = createCard(5, 5, 5, 5); // can't be standard-captured by opp1's values
    const opp1 = createCard(1, 1, 7, 5); // bottom=7, left=5 → same value as opp0.right=5, but combo shouldn't trigger Same
    const opp3 = createCard(1, 3, 1, 1); // right=3
    const playerCard = createCard(7, 1, 1, 3); // top=7, left=3

    const opponentHand = [opp0, opp1, opp3, createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(8, 8, 8, 8), createCard(10, 10, 10, 10), createCard(9, 9, 9, 9), createCard(2, 2, 2, 2)];
    let state = createInitialState(playerHand, opponentHand);

    state = placeCard(state, playerHand[1], 8);
    state = placeCard(state, opp0, 0);
    state = placeCard(state, playerHand[2], 6);
    state = placeCard(state, opp1, 1);
    state = placeCard(state, playerHand[3], 2);
    state = placeCard(state, opp3, 3);

    state = placeCard(state, playerCard, 4);

    expect(state.board[1]!.owner).toBe(Owner.Player); // Same
    expect(state.board[3]!.owner).toBe(Owner.Player); // Same
    // opp0 should NOT be captured — combo only does standard, and 5 is not < 5
    expect(state.board[0]!.owner).toBe(Owner.Opponent);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/engine/board.test.ts`
Expected: FAIL

**Step 3: Implement combo cascades**

Update `placeCard` flow in `src/engine/board.ts`:

1. Place card on board
2. Run Plus → collect flipped positions
3. Run Same → collect flipped positions
4. For all flipped positions, run standard capture against their neighbors (NOT Plus/Same). If any new flips occur, add those to the queue and continue (BFS).
5. Run standard capture for the originally placed card

**Step 4: Run test to verify it passes**

Run: `bun test tests/engine/board.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/board.ts tests/engine/board.test.ts
git commit -m "feat: combo cascade resolution"
```

---

### Task 8: Edge Cases & Full Game Test

**Files:**
- Modify: `tests/engine/board.test.ts`

**Step 1: Write edge case and full game tests**

```typescript
describe("edge cases", () => {
  it("corner card has only 2 neighbors", () => {
    // Place at position 0 (top-left corner) — only neighbors are 1 (right) and 3 (below)
    const opponentCard1 = createCard(1, 1, 1, 1);
    const opponentCard2 = createCard(1, 1, 1, 1);
    const playerCard = createCard(5, 5, 5, 5);

    const opponentHand = [opponentCard1, opponentCard2, createCard(2, 2, 2, 2), createCard(4, 4, 4, 4), createCard(6, 6, 6, 6)];
    const playerHand = [playerCard, createCard(8, 8, 8, 8), createCard(9, 9, 9, 9), createCard(10, 10, 10, 10), createCard(7, 7, 7, 7)];
    let state = createInitialState(playerHand, opponentHand);

    state = placeCard(state, playerHand[1], 8);
    state = placeCard(state, opponentCard1, 1);
    state = placeCard(state, playerHand[2], 6);
    state = placeCard(state, opponentCard2, 3);
    // Player places at 0 — captures both neighbors
    state = placeCard(state, playerCard, 0);

    expect(state.board[1]!.owner).toBe(Owner.Player);
    expect(state.board[3]!.owner).toBe(Owner.Player);
  });
});

describe("full game", () => {
  it("plays a complete 9-turn game with correct scoring", () => {
    // 5 player cards, 5 opponent cards, alternating placement
    const p1 = createCard(5, 5, 5, 5);
    const p2 = createCard(4, 4, 4, 4);
    const p3 = createCard(3, 3, 3, 3);
    const p4 = createCard(2, 2, 2, 2);
    const p5 = createCard(1, 1, 1, 1);

    const o1 = createCard(6, 6, 6, 6);
    const o2 = createCard(7, 7, 7, 7);
    const o3 = createCard(8, 8, 8, 8);
    const o4 = createCard(9, 9, 9, 9);
    const o5 = createCard(10, 10, 10, 10);

    let state = createInitialState([p1, p2, p3, p4, p5], [o1, o2, o3, o4, o5]);

    // Play all 9 turns: player 0,2,4,6,8 — opponent 1,3,5,7
    // Place in order that avoids captures for simplicity
    state = placeCard(state, p1, 0); // player turn 1
    state = placeCard(state, o1, 8); // opponent turn 1
    state = placeCard(state, p2, 2); // player turn 2
    state = placeCard(state, o2, 6); // opponent turn 2
    state = placeCard(state, p3, 1); // player turn 3 — adjacent to p1(right=5) and p2(left=4). p1 and p2 are player's, no capture
    state = placeCard(state, o3, 7); // opponent — adjacent to o1 and o2, same owner
    state = placeCard(state, p4, 3); // player — adjacent to p1(bottom=5). Same owner.
    state = placeCard(state, o4, 5); // opponent — adjacent to p2. o4 right=9 vs p2 right... wait
    // o4 at 5, p2 at 2: 5's top-edge vs 2's bottom-edge. o4.top=9, p2.bottom=4 → captures p2!
    state = placeCard(state, p5, 4); // player places last card

    // Count final score using getScore
    const score = getScore(state);
    // All cards are on the board (hands empty), total = 9
    expect(score.player + score.opponent).toBe(9);
    expect(state.playerHand).toHaveLength(0);
    expect(state.opponentHand).toHaveLength(0);
  });
});
```

Note: The exact final scores depend on capture interactions. The implementing engineer should trace through the game carefully and adjust expected values. The key assertions are: all 9 cells filled, hands empty, scores sum to 9.

**Step 2: Run tests**

Run: `bun test tests/engine/board.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/engine/board.test.ts
git commit -m "test: add edge cases and full game test"
```

---

### Task 9: Minimax Solver (Basic)

**Files:**
- Modify: `src/engine/solver.ts`
- Modify: `tests/engine/solver.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "bun:test";
import { createCard, createInitialState, Owner, Outcome, type GameState } from "../../src/engine/types";
import { placeCard } from "../../src/engine/board";
import { findBestMove } from "../../src/engine/solver";

describe("findBestMove", () => {
  it("returns no moves for a full board", () => {
    // Fill all 9 cells
    const p = [createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3), createCard(4,4,4,4), createCard(5,5,5,5)];
    const o = [createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8), createCard(9,9,9,9), createCard(10,10,10,10)];
    let state = createInitialState(p, o);
    // Fill board (placing in corners/edges to minimize captures for simplicity)
    state = placeCard(state, p[0], 0);
    state = placeCard(state, o[0], 8);
    state = placeCard(state, p[1], 2);
    state = placeCard(state, o[1], 6);
    state = placeCard(state, p[2], 1);
    state = placeCard(state, o[2], 7);
    state = placeCard(state, p[3], 3);
    state = placeCard(state, o[3], 5);
    state = placeCard(state, p[4], 4);

    const moves = findBestMove(state);
    expect(moves).toHaveLength(0);
  });

  it("finds the only winning move", () => {
    // Late game scenario: 1 card each, 1 empty cell
    // Set up so only one move exists and it wins
    // We need a state with 1 card in hand, 1 empty cell
    // Build this by placing 8 cards manually
    const p = [createCard(10,10,10,10), createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3), createCard(4,4,4,4)];
    const o = [createCard(1,1,1,1), createCard(5,5,5,5), createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8)];
    let state = createInitialState(p, o);

    // Place 8 cards, leaving position 4 (center) empty
    // Player's last card is p[0] (10,10,10,10) — should capture neighbors
    state = placeCard(state, p[1], 0);
    state = placeCard(state, o[0], 1);
    state = placeCard(state, p[2], 2);
    state = placeCard(state, o[1], 3);
    // skip 4
    state = placeCard(state, p[3], 5);
    state = placeCard(state, o[2], 6);
    state = placeCard(state, p[4], 7);
    state = placeCard(state, o[3], 8);

    const moves = findBestMove(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].position).toBe(4);
    expect(moves[0].card).toBe(p[0]);
  });

  it("ranks winning moves above drawing moves above losing moves", () => {
    // Create a state with multiple possible moves having different outcomes
    // This needs a carefully constructed mid-game state
    // For now, just verify the ordering property on a simple case
    const p = [createCard(10,10,10,10), createCard(9,9,9,9), createCard(1,1,1,1), createCard(2,2,2,2), createCard(3,3,3,3)];
    const o = [createCard(5,5,5,5), createCard(6,6,6,6), createCard(7,7,7,7), createCard(8,8,8,8), createCard(4,4,4,4)];
    const state = createInitialState(p, o);

    const moves = findBestMove(state);

    // Verify moves are sorted: wins first, then draws, then losses
    for (let i = 1; i < moves.length; i++) {
      const outcomeOrder = { win: 0, draw: 1, loss: 2 };
      expect(outcomeOrder[moves[i].outcome]).toBeGreaterThanOrEqual(outcomeOrder[moves[i-1].outcome]);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/engine/solver.test.ts`
Expected: FAIL — `findBestMove` not implemented.

**Step 3: Implement minimax solver**

In `src/engine/solver.ts`:

```typescript
import { type GameState, type RankedMove, type Card, Owner, Outcome } from "./types";
import { placeCard } from "./board";
import { getScore } from "./types";

export function findBestMove(state: GameState): RankedMove[] {
  const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;
  const emptyPositions = state.board
    .map((cell, i) => cell === null ? i : -1)
    .filter(i => i !== -1);

  if (hand.length === 0 || emptyPositions.length === 0) {
    return [];
  }

  const moves: RankedMove[] = [];

  for (const card of hand) {
    for (const position of emptyPositions) {
      const newState = placeCard(state, card, position);
      const minimaxResult = minimax(newState, state.currentTurn);
      moves.push({
        card,
        position,
        outcome: minimaxResult.outcome,
        robustness: minimaxResult.robustness,
      });
    }
  }

  // Sort: wins first, then draws, then losses. Within same outcome, higher robustness first.
  const outcomeOrder = { win: 0, draw: 1, loss: 2 };
  moves.sort((a, b) => {
    const orderDiff = outcomeOrder[a.outcome] - outcomeOrder[b.outcome];
    if (orderDiff !== 0) return orderDiff;
    return b.robustness - a.robustness;
  });

  return moves;
}
```

The `minimax` function:
- At terminal states (board full): evaluate score. If current player has more cards → Win, equal → Draw, fewer → Loss.
- At non-terminal: if it's the original player's turn (maximizing), pick the move with the best outcome. If opponent's turn (minimizing), pick worst for original player.
- Robustness: at a maximizing node, for the best outcome value, count what fraction of opponent responses still result in that outcome or better for the original player.

**Step 4: Run test to verify it passes**

Run: `bun test tests/engine/solver.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/solver.ts tests/engine/solver.test.ts
git commit -m "feat: minimax solver with move ranking"
```

---

### Task 10: Alpha-Beta Pruning & Transposition Table

**Files:**
- Modify: `src/engine/solver.ts`
- Modify: `tests/engine/solver.test.ts`

**Step 1: Write a performance test**

```typescript
describe("solver performance", () => {
  it("solves a full game from turn 1 within 5 seconds", () => {
    const p = [createCard(10,5,3,8), createCard(7,6,4,9), createCard(2,8,6,3), createCard(5,4,7,1), createCard(9,3,2,6)];
    const o = [createCard(4,7,5,2), createCard(8,3,9,6), createCard(1,5,8,4), createCard(6,9,1,7), createCard(3,2,4,10)];
    const state = createInitialState(p, o);

    const start = performance.now();
    const moves = findBestMove(state);
    const elapsed = performance.now() - start;

    expect(moves.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5000); // 5 seconds
    console.log(`Turn 1 solve: ${elapsed.toFixed(0)}ms, ${moves.length} moves`);
  });
});
```

**Step 2: Run test — likely slow without pruning**

Run: `bun test tests/engine/solver.test.ts`
Expected: May PASS but slow, or FAIL on timeout. This establishes the baseline.

**Step 3: Add alpha-beta pruning**

Update `minimax` to accept alpha/beta parameters. Prune branches where the current node's value can't affect the final result.

**Step 4: Add transposition table**

Hash the board state (card values + ownership at each position) and cache minimax results. Before computing, check the cache. This avoids re-evaluating identical positions reached via different move orders.

A simple hash: concatenate the card values and owner at each position into a string key.

**Step 5: Run performance test again**

Run: `bun test tests/engine/solver.test.ts`
Expected: PASS, significantly faster. Log the improvement.

**Step 6: Verify all existing tests still pass**

Run: `bun test`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/engine/solver.ts tests/engine/solver.test.ts
git commit -m "perf: add alpha-beta pruning and transposition table"
```

---

### Task 11: Tie-Breaking by Robustness

**Files:**
- Modify: `src/engine/solver.ts`
- Modify: `tests/engine/solver.test.ts`

**Step 1: Write the failing test**

```typescript
describe("tie-breaking", () => {
  it("prefers moves with higher robustness among equal outcomes", () => {
    // Construct a state where two moves both lead to a win,
    // but one has a wider winning margin (more opponent errors lead to player winning)
    // This requires a carefully constructed mid-game state.
    //
    // Strategy: 3 cards each, 3 empty cells. Two possible card placements both win
    // with perfect play, but one leaves the opponent more room to blunder.
    //
    // The exact setup will need to be determined empirically by the implementing engineer.
    // Key assertion: among moves with the same outcome, robustness is non-increasing.
    const p = [createCard(10,10,10,10), createCard(9,9,9,9), createCard(8,8,8,8), createCard(1,1,1,1), createCard(2,2,2,2)];
    const o = [createCard(3,3,3,3), createCard(4,4,4,4), createCard(5,5,5,5), createCard(6,6,6,6), createCard(7,7,7,7)];
    const state = createInitialState(p, o);

    const moves = findBestMove(state);
    const winMoves = moves.filter(m => m.outcome === Outcome.Win);

    if (winMoves.length > 1) {
      for (let i = 1; i < winMoves.length; i++) {
        expect(winMoves[i].robustness).toBeLessThanOrEqual(winMoves[i-1].robustness);
      }
    }
  });
});
```

**Step 2: Implement robustness calculation if not already done in Task 9**

Robustness for a move = fraction of the opponent's immediate responses where the original player still achieves the best outcome or better.

For a winning move: how many of the opponent's next moves still lead to a player win (regardless of opponent's subsequent play)?

Update the minimax function to track this metric.

**Step 3: Run tests**

Run: `bun test`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/engine/solver.ts tests/engine/solver.test.ts
git commit -m "feat: tie-breaking by robustness score"
```

---

### Task 12: Barrel Export & API Cleanup

**Files:**
- Modify: `src/engine/index.ts`

**Step 1: Set up exports**

```typescript
// ABOUTME: Public API barrel export for the Triple Triad engine.
// ABOUTME: Re-exports types, board logic, and solver functions.

export {
  type Card,
  type PlacedCard,
  type BoardCell,
  type Board,
  type GameState,
  type RankedMove,
  type Neighbor,
  CardType,
  Owner,
  Outcome,
  ADJACENCY,
  createCard,
  createInitialState,
  getScore,
} from "./types";

export { placeCard } from "./board";
export { findBestMove } from "./solver";
```

**Step 2: Verify all tests pass via barrel import**

Add a quick smoke test or update existing imports to use the barrel export and confirm everything works.

Run: `bun test`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/engine/index.ts
git commit -m "feat: barrel export for engine public API"
```

---

### Task 13: Card Data Scraper

**Files:**
- Create: `scripts/scrape-cards.ts`
- Create: `src/data/cards.json` (generated output)

**Step 1: Write the scraper script**

```typescript
// ABOUTME: One-off script to fetch Triple Triad card data from ffxivcollect.com API.
// ABOUTME: Outputs src/data/cards.json with normalized card stats.

const API_URL = "https://ffxivcollect.com/api/1/triad/cards";

interface FFXIVCollectCard {
  id: number;
  name: string;
  stars: number;
  stats: {
    numeric: { top: number; right: number; bottom: number; left: number };
  };
  type: { id: number; name: string };
  owned: string; // e.g. "42%"
}

interface CardData {
  id: number;
  name: string;
  top: number;
  right: number;
  bottom: number;
  left: number;
  type: "primal" | "scion" | "society" | "garlean" | "none";
  stars: number;
  owned: number;
}

function mapType(typeName: string): CardData["type"] {
  const lower = typeName.toLowerCase();
  if (lower === "primal") return "primal";
  if (lower === "scion") return "scion";
  if (lower === "society") return "society";
  if (lower === "garlean") return "garlean";
  return "none";
}

async function main() {
  const response = await fetch(API_URL);
  const data = await response.json();
  const cards: CardData[] = data.results.map((card: FFXIVCollectCard) => ({
    id: card.id,
    name: card.name,
    top: card.stats.numeric.top,
    right: card.stats.numeric.right,
    bottom: card.stats.numeric.bottom,
    left: card.stats.numeric.left,
    type: mapType(card.type.name),
    stars: card.stars,
    owned: parseFloat(card.owned.replace("%", "")) || 0,
  }));

  await Bun.write("src/data/cards.json", JSON.stringify(cards, null, 2));
  console.log(`Wrote ${cards.length} cards to src/data/cards.json`);
}

main();
```

**Step 2: Run the scraper**

Run: `bun scripts/scrape-cards.ts`
Expected: Outputs `src/data/cards.json` with 300+ cards.

**Step 3: Verify output**

Spot-check a few cards in the JSON for correct values.

**Step 4: Commit**

```bash
git add scripts/scrape-cards.ts src/data/cards.json
git commit -m "feat: add card data scraper and initial card database"
```

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Project scaffolding | — |
| 2 | Core types | 1 |
| 3 | Card placement (no captures) | 2 |
| 4 | Standard capture | 3 |
| 5 | Same rule | 4 |
| 6 | Plus rule | 4 |
| 7 | Combo cascades | 5, 6 |
| 8 | Edge cases & full game test | 7 |
| 9 | Minimax solver (basic) | 4 |
| 10 | Alpha-beta pruning & transposition table | 9 |
| 11 | Tie-breaking by robustness | 10 |
| 12 | Barrel export & API cleanup | 11 |
| 13 | Card data scraper | 1 |

Tasks 5 & 6 can be done in parallel. Task 13 is independent and can be done at any time after Task 1.
