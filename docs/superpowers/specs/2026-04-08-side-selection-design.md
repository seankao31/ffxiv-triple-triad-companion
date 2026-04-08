# ENG-85: Player Side Selection

## Summary

Let the player choose which visual side (left/right) they sit on during setup. Left is always blue, right is always red — matching the actual FFXIV Triple Triad game. This is purely visual and does not affect turn order, game logic, or the engine.

## Constraints

- Left = blue, right = red — fixed to position, not ownership
- Side choice is independent of first-turn selection
- No engine changes — `Owner.Player` / `Owner.Opponent` semantics unchanged
- Default: player on left (blue), preserving current behavior

## Design

### Store

Add `playerSide: 'left' | 'right'` to `AppState` with default `'left'`. Add a setter `updatePlayerSide()` that writes the value. Reset to `'left'` on game reset (same as other setup state).

### Color Mapping

Add a UI-layer helper that maps `Owner` to a visual color based on `playerSide`:

- Player on left: `Player → blue`, `Opponent → red` (current behavior)
- Player on right: `Player → red`, `Opponent → blue`

This function is used by all components that apply blue/red styling (BoardCell, HandPanel, etc.). It replaces the current hardcoded `Owner.Player === blue` checks.

### Setup View

- Add a "Your Side" radio group near the existing "First Turn" radio, with options: **Left (Blue)** and **Right (Red)**
- Hand inputs swap order based on `playerSide` — "Your Hand" always appears on the player's chosen side
- Radio button style matches the existing first-turn control

### Game View

- `HandPanel` render order in `GameView.svelte` swaps based on `playerSide`
- When player is on the right: `[HandPanel(Opponent), Board, HandPanel(Player)]`
- When player is on the left: `[HandPanel(Player), Board, HandPanel(Opponent)]` (current)

### Board Cells

- `BoardCell.svelte` uses the color mapping function instead of hardcoded `Owner.Player → bg-accent-blue-dim`
- A player card placed on the board is blue when player is on the left, red when on the right

### Hand Panels

- `HandPanel.svelte` uses the color mapping for:
  - Active turn indicator dot color
  - Selected card border and background color

### Swap Step

- `SwapStep.svelte` swaps hand display order to match `playerSide`, same as setup and game views

## Components Touched

| File | Change |
|------|--------|
| `src/app/store.ts` | Add `playerSide` to `AppState`, add `updatePlayerSide()`, reset in `resetGame()` |
| `src/app/components/setup/SetupView.svelte` | Add side radio picker, swap hand input order |
| `src/app/components/game/GameView.svelte` | Swap `HandPanel` render order |
| `src/app/components/game/BoardCell.svelte` | Use color mapping for cell backgrounds |
| `src/app/components/game/HandPanel.svelte` | Use color mapping for turn indicator + selection styling |
| `src/app/components/setup/SwapStep.svelte` | Swap hand display order |

## What This Does NOT Change

- Engine types (`Owner` enum, `GameState`, `Board`)
- Game logic (capture rules, turn order, win conditions)
- Solver or PIMC behavior
- Rust/WASM engine
