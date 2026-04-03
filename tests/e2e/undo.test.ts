// ABOUTME: E2E test for the Undo button during gameplay.
// ABOUTME: Verifies that undo returns a placed card to the hand and frees the board cell.
import { test, expect } from '@playwright/test';
import { fillHands, placeCard, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('undo returns card to hand and frees board cell', async ({ page }) => {
  await page.goto('/');

  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Verify initial state: 9 empty cells, Undo disabled.
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  // Place a card.
  await placeCard(page, '5 3 7 2', 4);

  // Verify: 8 empty cells, Undo enabled.
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  // Click Undo.
  await page.getByRole('button', { name: 'Undo' }).click();

  // Verify: 9 empty cells again, card back in player hand, Undo disabled.
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  // The card should be back in the player hand panel.
  await expect(page.getByRole('button', { name: '5 3 7 2' })).toBeVisible();
});
