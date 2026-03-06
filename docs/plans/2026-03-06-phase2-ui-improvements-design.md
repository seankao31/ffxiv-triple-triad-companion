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

None required. `findBestMove` already returns all card+position combos with outcomes. The UI filters by selected card.

## Store Changes

- Add `firstTurn: Owner` to `AppState` (defaults to `Owner.Player`)
- `startGame` passes `firstTurn` to `createInitialState`

## Type Icon Reference

Card type icons from FFXIV (for future use when rendering actual icons):
- Primal: red symbol
- Scion: yellow symbol
- Society: green symbol
- Garlean: blue symbol

For now, use colored text indicators: `[P]` red, `[Sc]` yellow, `[So]` green, `[G]` blue.
