# ENG-37: Show Active Rules in Game UI

Display which rules are active during a game so the player has a clear reference without needing to go back to setup.

## Data Source

Read from `$game.ruleset`, `$game.swap`, and `$game.threeOpen` (the app store). These values are set during setup and don't change during play, so reading from `$game` is safe and simple — no need for a derived store or reading from `GameState.rules`.

## Component

New `ActiveRules.svelte` component, rendered in `GameView.svelte` between the header bar and the main play area (above the board).

## Rendering Logic

1. Build a list of active rule names by checking each boolean:
   - `plus` → "Plus"
   - `same` → "Same"
   - `reverse` → "Reverse"
   - `fallenAce` → "Fallen Ace"
   - `ascension` → "Ascension"
   - `descension` → "Descension"
   - `swap` → "Swap"
   - `threeOpen` → "Three Open"
2. If list is non-empty, show "Active rules: " prefix followed by names joined with ` · ` (middle dot separator)
3. If list is empty, show "No active rules"

Only active rules are displayed — inactive rules are omitted entirely.

## Styling

- `text-sm text-surface-400` — matches existing secondary text in the game UI
- Centered horizontally above the board area
- Inline text list (e.g. `Plus · Same · Fallen Ace`), not pills/tags

## Testing

- UI test: renders active rules when present (e.g. "Plus · Same")
- UI test: renders "No active rules" when none are active
- UI test: includes format rules (Swap, Three Open) when active
