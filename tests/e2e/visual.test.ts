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

test('board mid-game with placed cards', async ({ page }) => {
  await page.goto('/');
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Place 6 cards (3 player, 3 opponent) — always click first empty cell.
  await placeCard(page, '5 3 7 2', 0);  // Player turn 1
  await placeCard(page, '4 5 6 3', 0);  // Opponent turn 2
  await placeCard(page, '4 6 2 8', 0);  // Player turn 3
  await placeCard(page, '7 3 5 4', 0);  // Opponent turn 4
  await placeCard(page, '3 5 5 7', 0);  // Player turn 5
  await placeCard(page, '2 8 1 6', 0);  // Opponent turn 6

  const layout = page.getByTestId('game-layout');
  await expect(layout).toHaveScreenshot('board-mid-game.png', SCREENSHOT_OPTS);
});
