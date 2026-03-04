# Triple Triad Engine Design

## Overview

A Triple Triad companion app that provides real-time move optimization for FFXIV Triple Triad. The core is a pure TypeScript game engine with a minimax solver, later to be ported to Rust/WASM for imperfect-information performance.

## v1 Scope

- **Rules**: Standard capture + Plus + Same + Combo cascades
- **Format**: All Open only (perfect information)
- **Features**: Live Solver (game assistant with ranked move suggestions)

## Architecture

Engine-first approach: the game engine is a standalone TypeScript library with no UI or framework dependencies. The Svelte UI is a later phase that imports the engine.

### Data Model

- **Card**: Four directional values (top, right, bottom, left) as numbers 1-10 (10 = A), plus a type enum (Primal, Scion, Society, Garlean, None).
- **BoardCell**: Either empty, or holds a Card + owner (Player | Opponent).
- **GameState**: Immutable value object containing:
  - 3x3 board (9 cells)
  - Player hand (up to 5 cards)
  - Opponent hand (up to 5 cards)
  - Whose turn it is
  - Score (player cards on board + in hand)

### Game Logic

**`placeCard(state, card, position) → GameState`**: The core function. Takes a state, applies a card placement, resolves all captures, and returns a new immutable state.

Capture resolution order:

1. Plus check — two or more adjacent cards (including friendly cards) where the sums of touching values are equal. Only opponent cards among matched pairs are flipped.
2. Same check — two or more adjacent cards (including friendly cards) where touching values are equal. Only opponent cards among matched pairs are flipped.
3. Combo cascade — any card flipped by Plus/Same triggers standard capture checks (value comparison) against its neighbors, recursively. Combos do NOT re-trigger Plus/Same.
4. Standard capture — the placed card captures adjacent opponent cards where its value exceeds the opponent's touching value.

### Solver

**`findBestMove(state) → RankedMove[]`**: Minimax with alpha-beta pruning over the full game tree (9 turns max depth).

- **Evaluation**: At terminal states, count captures. Full-depth search means no heuristic needed for non-terminal states.
- **Transposition table**: Keyed on board state hash for deduplication.
- **Tie-breaking**: When multiple moves share the same minimax value, prefer the move where more opponent responses lead to a loss for the opponent (higher "robustness" — the winning path is wider).

### Key Design Decisions

- **Immutable state**: Every operation returns a new GameState. Free undo/redo via history stack. Clean solver tree search.
- **Pure functions**: No side effects. Input → output. Trivially testable and portable.
- **Engine isolation**: The engine never imports from the UI layer. When porting to Rust/WASM, only the engine module is swapped.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun
- **Bundler**: Vite (needed for Svelte compilation)
- **Frontend** (later phase): Svelte + Tailwind CSS
- **Testing**: `bun test`
- **Card data**: Static JSON scraped from ffxivcollect.com API

## Project Structure

```
src/
  engine/
    types.ts        — Card, BoardCell, GameState, enums
    board.ts        — placeCard, capture resolution, combo cascades
    solver.ts       — minimax, alpha-beta, transposition table
    index.ts        — public API barrel export
  data/
    cards.json      — scraped card database (for future use)
  app/              — Svelte UI (later phase)
scripts/
  scrape-cards.ts   — one-off script to fetch card data from ffxivcollect API
tests/
  engine/
    board.test.ts   — game logic tests
    solver.test.ts  — solver tests
```

## Card Data

### Source

ffxivcollect.com API (`https://ffxivcollect.com/api/...`). Returns card stats, type, rarity, and ownership percentage.

### Schema

```typescript
{
  id: number,
  name: string,
  top: number,
  right: number,
  bottom: number,
  left: number,
  type: "primal" | "scion" | "society" | "garlean" | "none",
  stars: number,        // rarity (1-5)
  owned: number         // % of players who own it
}
```

### Usage

- **v1**: Not used at runtime. User inputs card stats manually.
- **Later**: Powers card search/autocomplete, deck builder, and probability distributions for imperfect-information solver (PIMC).

## UI (Later Phase)

PC-first, wide-screen layout:

- **Left**: Player's hand (5 cards, vertical stack)
- **Center**: 3x3 board, click-to-place
- **Right**: Solver output — ranked moves with win/draw/loss percentages

### Game Flow

1. **Setup**: User inputs both hands (4 values + type per card, 10 cards total).
2. **Play**: Players alternate turns. On user's turn, solver shows suggestions, user places a card. On opponent's turn, user inputs what the opponent played (which card, which cell).
3. **After each move**: Solver re-evaluates and updates suggestions.
4. **Undo/redo**: Navigate the immutable state history stack.

## Testing Strategy

### Engine Tests (board)

- Card placement on empty cell, correct owner
- Standard capture (higher value flips opponent)
- No capture (equal or lower value)
- Plus rule: matching sums trigger capture
- Same rule: matching values trigger capture
- Plus/Same with friendly adjacency: player's own cards count toward pairs but aren't captured
- Combo cascade: flipped cards trigger standard captures on their neighbors
- Combo does NOT re-trigger Plus/Same
- Edge/corner cards (fewer neighbors)
- Multiple simultaneous captures
- Full 9-turn game with correct final score

### Solver Tests

- Forced win: only one winning move, solver finds it
- Avoid loss: most moves lose, solver picks the survivor
- Tie-breaking: multiple winning moves, solver prefers the more robust one
- Terminal state: full board returns no moves
- Turn 1: returns all 45 moves ranked

## Future Work (Out of v1 Scope)

- **Imperfect information**: PIMC (Perfect Information Monte Carlo) solver for Three Open / Hidden formats. Rust/WASM port for performance.
- **Deck Builder**: Genetic algorithm to find optimal 5-card combinations from user's collection.
- **Post-Game Analysis**: Move classification (Brilliant/Best/Mistake/Blunder), advantage timeline.
- **Additional rules**: Ascension, Descension, Reverse, Fallen Ace, Order, Chaos, Swap, Sudden Death.
- **Card search UI**: Autocomplete backed by scraped card database.
