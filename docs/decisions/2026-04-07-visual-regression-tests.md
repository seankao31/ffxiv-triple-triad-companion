# Visual Regression Tests

## Goal

Playwright visual regression tests (screenshot diffing) to catch CSS/layout
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
| 2 | Hand panels during play | Element: `game-layout` after game start | Hand card sizing, type badges, active turn indicator |
| 3 | Board mid-game | Element: `game-layout` after 6 placements | Card stat positioning, ownership colors, board grid spacing |
| 4 | Solver suggestion | Element: `game-layout` after solver returns | Gold ring highlight on best-move card, eval overlays on board cells |

Scenarios 3 and 4 share the same mid-game state (6 cards placed) so the
solver search space is small and the suggestion arrives near-instantly.

## Locator Strategy

Two `data-testid` attributes provide reliable element locators:

- `data-testid="board"` — Board.svelte grid div (available for tighter scoping)
- `data-testid="game-layout"` — GameView.svelte flex container (board + both hand panels + solver panel)

## Solver Timing

Wait for a concrete DOM signal, not a fixed timer:

```ts
await layout.locator('button.ring-accent-gold').waitFor({ timeout: 10_000 });
```

The `button` qualifier is important — SolverPanel's `<li>` elements also have
`ring-accent-gold`, and clicking those doesn't select a card. Playing 6 cards
first reduces the search space so the solver finishes quickly on any machine.

## Diff Threshold — `maxDiffPixels`, not `maxDiffPixelRatio`

We use `maxDiffPixels: 100` (absolute pixel budget).

The original design used `maxDiffPixelRatio: 0.01` (1%), but testing against
the actual CardFace bug revealed that `maxDiffPixelRatio` interacts with
Playwright's anti-aliasing detection in ways that silently accept real diffs.
The 878-pixel layout regression (ratio 0.01) passed even at a 0.005 (0.5%)
ratio threshold. Switching to an absolute pixel count gives predictable results:
878 >> 100, clear failure.

## Baseline Workflow

- Baselines stored in `tests/e2e/visual.test.ts-snapshots/` (Playwright default)
- Baselines are version-controlled (committed to git)
- After intentional UI changes: `bunx playwright test visual --update-snapshots`
- PR diffs show exactly which `.png` baselines changed

## Out of Scope

- Full-page screenshots of every app state (keep snapshot count low)
- Cross-browser visual testing (Chromium only, matching existing E2E config)
- Component-level visual tests (Storybook/similar)
