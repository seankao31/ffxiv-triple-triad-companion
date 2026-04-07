# RevealableCard — Shared Reveal-Unknown-Card Component

**Issue:** ENG-42
**Date:** 2026-04-07

## Problem

SwapStep and HandPanel independently implement the same UI interaction: click an unknown card, show CardInput inline, emit the revealed card stats. The interaction mechanics (CardInput ref management, tick-then-focus, conditional rendering, cleanup) are duplicated. The store functions they call differ by design, but the UI pattern is identical.

## Design

### New component: `RevealableCard`

**Location:** `src/app/components/shared/RevealableCard.svelte`

**Props:**
- `revealing: boolean` — parent controls when this card is in reveal mode
- `onreveal: (card: Card) => void` — called when user completes CardInput

**Children snippet:** the normal (non-revealing) card display, fully controlled by the parent.

**Internal behavior:**
1. When `revealing` is `false`: render children snippet
2. When `revealing` transitions to `true`: render CardInput, `await tick()`, auto-focus first input field
3. When CardInput emits a valid card via `onchange`: call `onreveal(card)`

### What parents keep

- Reveal tracking state (`revealingIndex` in SwapStep, `revealingCardId` in HandPanel)
- Trigger logic (clicking "?" button in SwapStep, clicking unknown card in HandPanel)
- Completion callback (calls the appropriate store function + resets reveal state)

### What parents lose

- `revealCardInput` ref binding
- `await tick(); revealCardInput?.focusFirst()` imperative focus management
- Conditional `{#if revealing} <CardInput .../> {:else} ... {/if}` template block
- Direct `CardInput` import

## Acceptance criteria

1. A shared `RevealableCard` component handles the CardInput-display-and-focus interaction
2. Both SwapStep and HandPanel use `RevealableCard` instead of directly managing CardInput
3. Each caller provides its own `onreveal` callback (different store functions)
4. All existing tests pass without modification (or with minimal adaptation to the new structure)

## Testing

- Unit tests for `RevealableCard` in isolation: renders children when not revealing, renders CardInput when revealing, auto-focuses, calls `onreveal` on completion
- Existing SwapStep and HandPanel tests continue to pass (integration coverage)
