# All Open Rule & Visibility Mode Overhaul

## Problem

The app currently treats all opponent cards as known by default — the user must fill in all 5 opponent card slots to start a game. In FFXIV Triple Triad, the default is the opposite: all opponent cards are hidden. Visibility rules ("Three Open", "All Open") reveal some or all of them.

Additionally, "Three Open" currently allows *up to* 2 unknown slots, but the actual rule requires *exactly* 3 revealed and 2 hidden.

## Design

### Three mutually exclusive visibility modes

| Mode | UI state | Opponent hand in setup | Validation |
|------|----------|----------------------|------------|
| **All Open** | "All Open" checked | All 5 editable, must be filled | 0 nulls |
| **Three Open** | "Three Open" checked | All 5 editable, "?" toggle available | Exactly 2 nulls |
| **Hidden** (default) | Neither checked | All 5 locked as "?" | 5 nulls |

Checking "All Open" unchecks "Three Open" and vice versa. Neither checked = hidden (default).

### Store changes (`src/app/store.ts`)

- Add `allOpen: boolean` to `AppState`, default `false`.
- Add `updateAllOpen(v: boolean)` — sets `allOpen`; if enabling, also sets `threeOpen = false`.
- Update `updateThreeOpen(v: boolean)` — if enabling, also sets `allOpen = false`.
- Revise `startGame()` validation:
  - All Open: no nulls in opponent hand.
  - Three Open: exactly 2 nulls in opponent hand.
  - Hidden: all 5 must be null (enforced by locked UI, validated as safety net).

### UI changes

**`RulesetInput.svelte`**: Add "All Open" checkbox wired to `updateAllOpen`, with mutual exclusion handled by the store.

**`SetupView.svelte`**: When hidden mode (neither `allOpen` nor `threeOpen`), pass a `disabled` prop to the opponent `HandInput` so all 5 slots render as locked "?".

**`HandInput.svelte` / `CardInput.svelte`**: Support a `disabled` prop that locks slots to the "?" display state and prevents user interaction.

### Solver & engine

No changes. The solver already routes to PIMC when `unknownCardIds.size > 0`. With 5 unknowns it runs PIMC with maximum uncertainty. The Rust/WASM engine handles any number of unknown cards.

### What's NOT changing

- Player hand input (always required, no visibility rules).
- Swap rule (independent, works with any visibility mode).
- Card reveal during gameplay (already handles any unknown count).
- Rust/WASM engine internals.
- Server API contract.

## Test plan

- Store unit tests: mutual exclusion of `allOpen`/`threeOpen`, validation for each mode.
- UI tests: All Open checkbox renders, mutual exclusion toggles, opponent hand disabled in hidden mode.
- E2E: start a game in hidden mode (all 5 unknown), verify PIMC solver activates.
- Existing Three Open tests updated to require exactly 2 nulls.
