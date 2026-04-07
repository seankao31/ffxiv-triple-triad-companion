# Visual Regression Tests — Design Spec

## Goal

Add Playwright visual regression tests (screenshot diffing) to catch CSS/layout
regressions that unit tests with happy-dom cannot detect. A dedicated test file
(`tests/e2e/visual.test.ts`) captures element-scoped snapshots at key visual
moments, decoupled from functional E2E tests.

## Motivation

Commit `798eab7` introduced a layout regression where card stat numbers on the
board became vertically cramped. Unit tests passed because happy-dom doesn't
compute CSS layout. This went unnoticed until manual inspection. Visual
regression snapshots would have flagged the pixel-level change automatically.

## Snapshot Scenarios

| # | Name | Scope | What it catches |
|---|------|-------|-----------------|
| 1 | Setup view | Full page, after filling both hands | Card input grid layout, spacing, sizing |
| 2 | Board mid-game | Element: `game-layout` after 5–6 placements | Card stat positioning, ownership colors, board grid spacing |
| 3 | Hand panels during play | Element: `game-layout` after game start, before any placement | Hand card sizing, type badges, active turn indicator |
| 4 | Solver suggestion | Element: `game-layout` after solver returns | Gold ring highlight on best-move card, eval overlays on board cells |

Scenarios 2 and 4 share the same mid-game state (5–6 cards placed) so the
solver search space is small and the suggestion arrives near-instantly.

## Locator Strategy

Add `data-testid` attributes to two containers:

- `data-testid="board"` — Board.svelte grid div (available for tighter scoping later)
- `data-testid="game-layout"` — GameView.svelte flex container (board + both hand panels + solver panel)

Hand panels are locatable via heading text ("Your Hand" / "Opponent") if needed
individually — no extra testid required.

## Solver Timing

Wait for a concrete DOM signal, not a fixed timer:

```ts
await page.locator('[data-testid="game-layout"] .ring-accent-gold').waitFor();
```

The gold ring class is applied to the best-move card only after the solver
returns. Playing 5–6 cards first reduces the search space so the solver
finishes quickly on any machine.

## Diff Threshold

`maxDiffPixelRatio: 0.01` (1%) — absorbs subpixel antialiasing differences
across environments without masking real layout regressions. Configured via
`expect.toHaveScreenshot()` options.

## Baseline Workflow

- Baselines stored in `tests/e2e/visual.test.ts-snapshots/` (Playwright default convention)
- Baselines are version-controlled (committed to git)
- After intentional UI changes: `bunx playwright test visual --update-snapshots`
- PR diffs show exactly which `.png` baselines changed

## Playwright Config

No changes needed to `playwright.config.ts`. The existing Chromium-only,
single-worker setup is appropriate for visual tests. The `toHaveScreenshot()`
API is built into `@playwright/test` (v1.59.1).

## Test Structure

```
tests/e2e/visual.test.ts          — 4 snapshot scenarios
tests/e2e/visual.test.ts-snapshots/ — auto-generated baseline PNGs (committed)
```

The test reuses existing helpers (`fillHands`, `placeCard`, `DEFAULT_PLAYER`,
`DEFAULT_OPPONENT`) from `tests/e2e/helpers.ts`.

## Out of Scope

- Full-page screenshots of every app state (keep snapshot count low to avoid noisy diffs)
- Cross-browser visual testing (Chromium only, matching existing E2E config)
- Component-level visual tests (Storybook/similar) — may be considered separately
