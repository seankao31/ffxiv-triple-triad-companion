// ABOUTME: E2E test for the Reset button — verifies player hand is preserved.
// ABOUTME: Tests the bug fix: after reset, setup shows player cards but clears opponent cards.
import { test, expect } from '@playwright/test';
import { fillHands, placeCard, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('reset preserves player hand and clears opponent hand', async ({ page }) => {
  await page.goto('/');

  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Place one card to create game state.
  await placeCard(page, '5 3 7 2', 0);

  // Click Reset.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  // Player hand inputs should show preserved values.
  const topInputs = await page.getByLabel('Top').all();
  // First 5 are player hand, next 5 are opponent hand.
  await expect(topInputs[0]!).toHaveValue('5');
  await expect(topInputs[1]!).toHaveValue('4');
  await expect(topInputs[2]!).toHaveValue('3');
  await expect(topInputs[3]!).toHaveValue('6');
  await expect(topInputs[4]!).toHaveValue('7');

  // Opponent hand inputs should be empty.
  await expect(topInputs[5]!).toHaveValue('');
  await expect(topInputs[6]!).toHaveValue('');
});

test('reset after swap restores original player hand, not swapped hand', async ({ page }) => {
  await page.goto('/');

  // Enable Swap rule.
  await page.getByRole('checkbox', { name: 'Swap' }).click();

  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Swap phase: give player card 0 (5 3 7 2), receive opponent card 1 (7 3 5 4).
  await page.getByRole('button', { name: '5 3 7 2' }).click();
  await page.getByRole('button', { name: '7 3 5 4' }).click();
  await page.getByRole('button', { name: /confirm swap/i }).click();
  await expect(page.getByRole('heading', { name: 'FFXIV Triple Triad Companion' })).toBeVisible();

  // Reset back to setup.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  // Player hand should show original card stats, not the swapped opponent card.
  const topInputs = await page.getByLabel('Top').all();
  await expect(topInputs[0]!).toHaveValue('5'); // original, not '7' from swap
  await expect(topInputs[1]!).toHaveValue('4');
  await expect(topInputs[2]!).toHaveValue('3');
  await expect(topInputs[3]!).toHaveValue('6');
  await expect(topInputs[4]!).toHaveValue('7');
});
