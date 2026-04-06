# FFXIV Triple Triad Companion

## 1 Executive Summary

FFXIV Triple Triad Companion is a high-performance web application designed to be the "Stockfish" of FFXIV Triple Triad. It provides real-time move optimization, deck-building heuristics, and post-game analysis using a hybrid Rust/WASM engine for near-instant calculations.

## 2 Target Objectives

- Optimal Play: Provide a "Solved" solution for all perfect information games (All Open).
- Heuristic Excellence: Provide the statistically best moves for imperfect information games (Three Open / Hidden).
- Accessibility: Run on any modern browser with a responsive Svelte-based UI.
- Meta-Analysis: Allow users to find the highest-win-rate decks based on their own card collections.

## 3 Functional Requirements

### 3.1 The Game Engine (Core Logic)

The engine must be a deterministic state machine written in Rust, compiled to WASM.

- Rule Support: Implementation of all regional and match rules:
  - Calculation Rules: Plus, Same, Ascension, Descension, Reverse, Fallen Ace.
  - Format Rules: All Open, Three Open, Order, Chaos, Swap, Sudden Death.
  - Capture Mechanics: Standard (Value > Neighbor), Same, Plus, and the resulting Combo cascades.
  - Stat Modifiers: Ascension/Descension (type-based), Reverse, and Fallen Ace (A vs 1 logic).
  - Flow Constraints:
    - Order: AI search is restricted to the specific index in the current deck.
    - Chaos: Player inputs the "forced" card for the current turn; AI evaluates the best move for that specific card.
    - Swap: UI must allow the user to indicate which card was lost and which opponent card was received. If in "Three Open," the swapped card from the opponent becomes "Known" even if it wasn't one of the original three visible.
- State Management: Ability to "Undo/Redo" to any state in the game tree.
- Speed: Must be able to simulate $>1,000,000$ game states per second.

### 3.2 Feature Pillar 1: Live Game Assistant (The Solver)

- Input: Users select the active ruleset and input their deck and the opponent’s visible cards.
- Move Suggestion:
  - Display a ranked list of moves (Card + Slot).
  - Win/Draw/Loss %: Display expected outcomes for each move.
  - Sudden Death Support: If a draw occurs, the engine must immediately reset with the "captured" hands for Round 2.
- Incomplete Info Handling: For "Three Open" or hidden decks, use a probability-weighted search (assuming uniform distribution of remaining cards from the user's defined "Library").

### 3.3 Feature Pillar 2: The Lab (Deck Builder)

- Collection Manager: A checklist/filter for users to mark which of the 300+ cards they own.
- Optimization Algorithm: \* Use a Genetic Algorithm or Brute Force Search (depending on the card pool size) to find 5-card combinations with the highest average win rate against a "Standard Meta" or specific NPC decks.
- Rule-Specific Optimization: Suggest different decks for "Reverse" vs. "Ascension" environments.

### 3.4 Feature Pillar 3: Post-Game Analysis

- Game Import: Manual entry of a played game's moves.
- Evaluation Graph: A visual timeline of "Advantage" (who is winning at each turn).
- Move Classification:
  - Brilliant: Only move that maintains a win.
  - Best: The mathematically optimal move.
  - Mistake: A move that turns a Win into a Draw.
  - Blunder: A move that turns a Win/Draw into a Loss.

## 4 User Interface & Experience (UX)

### 4.1 Layout

- The Board: Central 3x3 grid with "Drag and Drop" or "Click-to-Place" functionality.
- The Sidebar: Real-time engine evaluations and "Best Move" text.
- The Drawer: Settings for rulesets and card library selection.
- UX/UI Focus (PC-First): Wide-screen optimized. Board in center-left, with a "Search Tree" or "Calculation Log" on the right to provide transparency into the AI's "thinking."

### 4.2 Tech Stack

- Frontend: Svelte (Framework), Tailwind CSS (Styling), Typescript, Vite, Bun.
- Logic Layer: Rust via wasm-bindgen.
- Storage: LocalStorage (to save user card collections and preferences).

## 5 Non-Functional Requirements

- Latency: Move suggestions must be updated in $<500ms$ to remain viable for 2-minute matches.
- Offline Capability: Since it’s a WASM-based web app, the core solver should work without a persistent internet connection after the initial load.

## 6 AI Component & Tech Stack Deep Dive

The AI needs to handle two distinct "modes" of information. This is where the Rust engine will shine.

### 6.1 The "Solved" Engine (Perfect Information)

For All Open or games where all opponent cards have been revealed:

- Algorithm: Minimax with Alpha-Beta Pruning.
- Search Depth: Full depth (9 turns).
- Complexity: The branching factor starts at $9 \times 5 = 45$. Even without pruning, the state space is manageable. With Alpha-Beta and a Transposition Table (storing previously seen board states), the "Best Move" will be found in milliseconds.
- Implementation: Rust compiled to WASM.

### 6.2 The "Probabilistic" Engine (Imperfect Information)

For Three Open or Hidden:

- Algorithm: Perfect Information Monte Carlo (PIMC).
- Process:
  1. The engine generates 1,000+ "Possible Decks" for the opponent based on the known card library and rarity constraints (e.g., NPCs usually have specific pools; players have rarity limits like 1x5★ and 4x3★).
  2. It runs a lightning-fast Minimax for each "World."
  3. It aggregates the results to give you the move with the highest Expected Value (EV).
- Advanced Option: CFR (Counterfactual Regret Minimization). This is how modern Poker AIs work. It learns to play against "hidden" information by playing against itself. This is more "Brilliant" but requires a pre-computed strategy (a "Blueprint").

### 6.3 The Deck Builder (The Meta Solver)

- Approach: Genetic Algorithm (GA).
- Fitness Function: Average win rate against a "Gauntlet" of common NPC decks or a uniform distribution of top-tier cards.
- Tech: Since this is a heavy background task, we can run this in a Web Worker in the browser so it doesn't freeze the UI.
