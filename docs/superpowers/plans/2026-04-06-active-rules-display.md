# ENG-37: Active Rules Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which rules are active during a game so the player has a reference without going back to setup.

**Architecture:** New `ActiveRules.svelte` component reads `$game.ruleset`, `$game.swap`, and `$game.threeOpen`. It renders active rule names joined by ` · `, or "No active rules" when none are on. `GameView.svelte` mounts it between the header and the play area.

**Tech Stack:** Svelte 5, Tailwind CSS v4, Vitest + @testing-library/svelte

**Spec:** `docs/superpowers/specs/2026-04-06-active-rules-display-design.md`

---

### Task 1: Create ActiveRules component with tests

**Files:**
- Create: `src/app/components/game/ActiveRules.svelte`
- Create: `tests/app/components/ActiveRules.test.ts`

- [ ] **Step 1: Write failing tests for ActiveRules**

Create `tests/app/components/ActiveRules.test.ts`:

```ts
// ABOUTME: Tests for ActiveRules — verifies active rule names are displayed during a game.
// ABOUTME: Covers capture rules, format rules, and the empty-rules fallback.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { game } from '../../../src/app/store';
import ActiveRules from '../../../src/app/components/game/ActiveRules.svelte';
import { Owner } from '../../../src/engine';

function setRules(overrides: Partial<{
  plus: boolean; same: boolean; reverse: boolean;
  fallenAce: boolean; ascension: boolean; descension: boolean;
  swap: boolean; threeOpen: boolean;
}> = {}) {
  game.set({
    phase: 'play',
    ruleset: {
      plus: overrides.plus ?? false,
      same: overrides.same ?? false,
      reverse: overrides.reverse ?? false,
      fallenAce: overrides.fallenAce ?? false,
      ascension: overrides.ascension ?? false,
      descension: overrides.descension ?? false,
    },
    swap: overrides.swap ?? false,
    threeOpen: overrides.threeOpen ?? false,
    playerHand: [null, null, null, null, null],
    setupPlayerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
  });
}

describe('ActiveRules', () => {
  beforeEach(() => setRules());

  it('renders "No active rules" when no rules are enabled', () => {
    render(ActiveRules);
    expect(screen.getByText('No active rules')).toBeInTheDocument();
  });

  it('renders active capture rules joined by middle dot', () => {
    setRules({ plus: true, same: true });
    render(ActiveRules);
    expect(screen.getByText('Plus · Same')).toBeInTheDocument();
  });

  it('renders Fallen Ace with proper casing', () => {
    setRules({ fallenAce: true });
    render(ActiveRules);
    expect(screen.getByText('Fallen Ace')).toBeInTheDocument();
  });

  it('includes format rules when active', () => {
    setRules({ reverse: true, swap: true, threeOpen: true });
    render(ActiveRules);
    expect(screen.getByText('Reverse · Swap · Three Open')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/ActiveRules.test.ts`
Expected: FAIL — `ActiveRules.svelte` does not exist yet.

- [ ] **Step 3: Create ActiveRules.svelte**

Create `src/app/components/game/ActiveRules.svelte`:

```svelte
<!-- ABOUTME: Displays which rules are active during a game as an inline text list. -->
<!-- ABOUTME: Shows "No active rules" when no capture or format rules are enabled. -->
<script lang="ts">
  import { game } from '../../store';

  const ruleLabels: [key: string, label: string][] = [
    ['plus', 'Plus'],
    ['same', 'Same'],
    ['reverse', 'Reverse'],
    ['fallenAce', 'Fallen Ace'],
    ['ascension', 'Ascension'],
    ['descension', 'Descension'],
  ];

  let activeRules = $derived.by(() => {
    const names: string[] = [];
    for (const [key, label] of ruleLabels) {
      if ($game.ruleset[key as keyof typeof $game.ruleset]) names.push(label);
    }
    if ($game.swap) names.push('Swap');
    if ($game.threeOpen) names.push('Three Open');
    return names;
  });
</script>

<div class="text-sm text-surface-400 text-center">
  {activeRules.length > 0 ? activeRules.join(' · ') : 'No active rules'}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/ActiveRules.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```
git add src/app/components/game/ActiveRules.svelte tests/app/components/ActiveRules.test.ts
git commit -m 'feat(ENG-37): add ActiveRules component with tests'
```

---

### Task 2: Integrate ActiveRules into GameView

**Files:**
- Modify: `src/app/components/game/GameView.svelte`
- Modify: `tests/app/components/GameView.test.ts`

- [ ] **Step 1: Write failing test for rules display in GameView**

Add to `tests/app/components/GameView.test.ts`, inside the existing `describe('GameView', ...)` block:

```ts
it('displays active rules above the board', () => {
  game.update((s) => ({ ...s, ruleset: { ...s.ruleset, plus: true, same: true } }));
  render(GameView);
  expect(screen.getByText('Plus · Same')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/components/GameView.test.ts`
Expected: FAIL — GameView doesn't render ActiveRules yet.

- [ ] **Step 3: Add ActiveRules to GameView**

In `src/app/components/game/GameView.svelte`, add the import and render it between the header `div` and the play area `div`:

Import:
```svelte
import ActiveRules from './ActiveRules.svelte';
```

Add `<ActiveRules />` between the header bar (the `div` with `flex items-center justify-between mb-4`) and the play area (the `div` with `flex gap-10 flex-1`):

```svelte
  </div>

  <ActiveRules />

  <div class="flex gap-10 flex-1 items-start justify-center pt-6">
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/GameView.test.ts`
Expected: All 5 tests PASS (4 existing + 1 new).

- [ ] **Step 5: Run full UI test suite**

Run: `bunx vitest run tests/app/`
Expected: All tests PASS — no regressions.

- [ ] **Step 6: Commit**

```
git add src/app/components/game/GameView.svelte tests/app/components/GameView.test.ts
git commit -m 'feat(ENG-37): integrate ActiveRules into GameView'
```
