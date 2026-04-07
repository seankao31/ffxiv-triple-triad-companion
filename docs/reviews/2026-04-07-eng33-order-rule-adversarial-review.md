# ENG-33 Order Rule — Adversarial Review

**Date:** 2026-04-07
**Commits:** 9fcffc9..068c664 (12 commits)
**Reviewer:** Codex adversarial review (3 focused passes)

## Finding 1: `ActiveRules.svelte` omits Order label

**Severity:** Medium | **Confidence:** 0.99 | **Verdict: Genuine bug**
**Disposition: Fixed** (commit `fix(ENG-33): add Order label to ActiveRules display`)

`src/app/components/game/ActiveRules.svelte:7-14` — the `ruleLabels` array lists every rule
except `order`. When Order is the only active rule, the UI displays "No active rules" while
actively force-selecting cards and dimming the hand.

**Fix:** Added `['order', 'Order']` to `ruleLabels`. Added a component test for an Order-only game.

## Finding 2: Shared Order fixtures may not validate slot consistency

**Severity:** Medium | **Confidence:** 0.94 | **Verdict: Confirmed — duplicate IDs in fixtures 31 and 32**
**Disposition: Fixed** (commit `fix(ENG-33): use unique card IDs in Order fixture generator`)

Fixtures 31 (`order_with_standard_capture`) and 32 (`order_with_plus`) reused the same `filler`
card object across multiple hand slots, producing duplicate IDs. Both engines passed by coincidence
(Order forces index 0, `find`/`position` returns first match), but this violated the unique-ID
invariant and could mask engine disagreements. Fixed by creating individual card objects per slot.
Regenerated fixtures verified against both TS and Rust engines.

## Finding 3: Rust `assert!` vs TS `throw` for illegal Order moves

**Severity:** High (reported) | **Confidence:** 0.97 | **Verdict: Valid, low real-world risk**
**Disposition: Acknowledged — no action**

- `engine-rs/src/board.rs:208-211` — `assert!(!state.rules.order || card_index == 0, ...)` panics
- `src/engine/board.ts:163-164` — `throw new Error(...)` is a catchable exception

This only fires if a caller passes a non-first card under Order — a precondition that should never
happen in production (the solver enumerates only legal moves; the UI auto-selects the forced card).
The `assert!` is idiomatic Rust for invariant violations. The practical difference only surfaces if
there's an upstream bug.

**Action:** Low priority. Consider converting to a `Result` return if the engine API surface grows
external callers.

## Finding 4: `selectedCard` not normalized during state transitions

**Severity:** Medium (reported) | **Confidence:** 0.74 | **Verdict: Architectural concern, not a bug**
**Disposition: Acknowledged — no action**

`startGame`, `handleSwap`, and `undoMove` don't explicitly set `selectedCard`. The
`currentState.subscribe` handler (`src/app/store.ts:260-271`) repairs selection by auto-selecting
`hand[0]` when Order is active. Manual trace through undo, swap, and new-game sequences confirms
the subscription reliably fires because each transition produces a new state object reference.

**Action:** No immediate fix needed. If store logic grows more complex, consider making transitions
explicitly set `selectedCard` instead of relying on the subscription side effect.

## Finding 5: `rules.order` required in serde (no `#[serde(default)]`)

**Severity:** High (reported) | **Confidence:** 0.97 | **Verdict: False positive — pre-existing pattern**
**Disposition: No action**

`engine-rs/src/types.rs:48-58` — `RuleSet` has no `#[serde(default)]`, so omitting any field
(including `order`) from JSON fails deserialization. However, ALL `RuleSet` fields (`plus`, `same`,
`reverse`, `fallenAce`, `ascension`, `descension`) are equally required. This is the established
pattern, not a regression introduced by ENG-33. The frontend always constructs the complete object
and there are no external API consumers.

**Action:** None. If external callers are ever supported, add `#[serde(default)]` to the struct.
