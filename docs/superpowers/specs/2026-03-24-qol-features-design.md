# QoL Features Design

Six quality-of-life improvements to the game UI and server infrastructure.

## Feature 1: Undo Guard

Guard `undoMove()` so it's a no-op when `history.length <= 1` (only the initial game state remains). Disable the Undo button visually in GameView when at the initial state.

Undo no longer doubles as "exit game" — that role moves to the new Reset feature.

### Files modified
- `src/app/store.ts` — guard in `undoMove()`
- `src/app/components/game/GameView.svelte` — disable button when at initial state

## Feature 2: Reset

Add a `resetGame()` function in `store.ts` that returns to the setup phase while preserving game settings for the next game.

**Preserves:** All game settings (ruleset, swap, threeOpen, firstTurn) and playerHand.

**Clears:** opponentHand (back to all nulls), history, selectedCard, unknownCardIds.

A "Reset" button in the GameView header bar, visually distinct from Undo (text-only or different color) since it's a destructive action.

The preserved `playerHand` still holds Card objects with IDs from the active game. This is safe because `startGame()` calls `resetCardIds()` and re-creates all cards with fresh IDs.

`RulesetInput` and `HandInput` initialize their local `$state` from `$game` at mount time. When reset transitions to setup, `App.svelte` switches from GameView to SetupView, re-mounting these components — they pick up the preserved values automatically.

### Files modified
- `src/app/store.ts` — add `resetGame()` export
- `src/app/components/game/GameView.svelte` — add Reset button calling `resetGame()`

## Feature 3: Server URL Default

When the user switches solver mode to "Native server," auto-populate the URL input with `http://127.0.0.1:8080` and call `updateServerEndpoint` immediately.

Uses `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues on macOS, where `localhost` may resolve to `::1` and hit a different service.

### Files modified
- `src/app/components/setup/ServerSettings.svelte` — populate default on mode switch

## Feature 4: Server Health Check

### Server side
- Add `GET /api/health` route to `server.rs` returning `200 OK` with `{"status": "ok"}`
- Add `clap` dependency with `--port` / `-p` flag, defaulting to `8080`

### Client side
On blur of the URL input in ServerSettings, fire `GET ${endpoint}/api/health` and show an inline status indicator:
- While checking: "Checking..."
- Success: green checkmark + "Connected"
- Failure: red X + "Cannot connect"

Uses a short timeout (~3s) on the fetch. Re-validates whenever the input blurs with a new value.

Non-blocking — does not gate `startGame()`. The inline feedback is sufficient; if the user ignores a red X, that's their choice.

### Files modified
- `engine-rs/src/bin/server.rs` — add health route, add clap for `--port`
- `engine-rs/Cargo.toml` — add `clap` dependency (with `derive` feature)
- `src/app/components/setup/ServerSettings.svelte` — health check on blur, status indicator

## Feature 5: Card Type & Modifier Display

### Type label (top-right corner of card)
Reuse SolverPanel's existing abbreviation and color scheme:
- `P` (Primal), `Sc` (Scion), `So` (Society), `G` (Garlean)
- Color classes: `text-type-primal`, `text-type-scion`, `text-type-society`, `text-type-garlean`
- Cards with `CardType.None` show nothing

Extract `typeAbbrev` and `typeColor` maps to a shared location so BoardCell, HandPanel, and SolverPanel all reference the same definitions.

### Modifier (top-left corner of card)
- Green text for Ascension (`+1`, `+2`, ...), red text for Descension (`-1`, `-2`, ...)
- Only shown when Ascension or Descension is active AND card type is not `None`
- Computed "live" from the current board state (count of same-type cards on the board)
- **Hand cards:** shows what the modifier would be if placed right now (changes every turn)
- **Board cards:** shows the current modifier based on the board as it stands (updates after each placement and capture)
- Display-only — capture logic continues to use the pre-placement snapshot

### Helper function
```ts
function boardTypeCount(state: GameState, type: CardType): number {
  let count = 0;
  for (const cell of state.board) {
    if (cell && cell.card.type === type) count++;
  }
  return count;
}
```

The modifier value is `+count` (Ascension) or `-count` (Descension), displayed only when `count > 0`.

### Files modified
- `src/app/components/game/BoardCell.svelte` — add type label and modifier to card display
- `src/app/components/game/HandPanel.svelte` — add type label and modifier to hand cards
- `src/app/components/game/SolverPanel.svelte` — import shared type maps instead of local definitions
- New shared file for `typeAbbrev`, `typeColor`, `boardTypeCount` (location TBD — could be a small `src/app/card-display.ts` or similar)

## Testing Strategy

Each feature needs tests following TDD:

1. **Undo Guard:** Test that `undoMove()` is a no-op at initial state. Test that undo still works normally with 2+ history entries.
2. **Reset:** Test that `resetGame()` preserves settings and player hand, clears opponent hand and history, sets phase to setup.
3. **Server URL Default:** Component test that switching to server mode populates the endpoint.
4. **Server Health Check:** Component test for the three states (checking, connected, failed). Rust test for the health endpoint.
5. **Card Type & Modifier:** Test `boardTypeCount` helper. Component tests that type labels and modifiers render correctly given game state with Ascension/Descension active.
