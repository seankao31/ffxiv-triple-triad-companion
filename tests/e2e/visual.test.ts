// ABOUTME: Visual regression tests — screenshot diffing to catch CSS/layout regressions.
// ABOUTME: Captures element-scoped snapshots at key visual states; decoupled from functional E2E tests.
import { test, expect } from '@playwright/test';
import { fillHands, placeCard, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.01 };

test('setup view with filled hands', async ({ page }) => {
  await page.goto('/');
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);

  await expect(page).toHaveScreenshot('setup-filled-hands.png', SCREENSHOT_OPTS);
});

test('hand panels at game start', async ({ page }) => {
  await page.goto('/');
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  const layout = page.getByTestId('game-layout');
  await expect(layout).toHaveScreenshot('hand-panels-game-start.png', SCREENSHOT_OPTS);
});
