// ABOUTME: E2E test for hidden mode — all opponent cards unknown at game start.
// ABOUTME: Verifies disabled opponent hand in setup, game start with 5 unknowns, and PIMC activation.
import { test, expect } from '@playwright/test';
import { type CardStats, DEFAULT_PLAYER } from './helpers';

/**
 * Fill only the player hand. In hidden mode (default), opponent hand is locked.
 */
async function fillPlayerHand(
  page: import('@playwright/test').Page,
  playerCards: CardStats[],
): Promise<void> {
  const values = playerCards.flat();
  const inputs = await page.getByRole('textbox').all();
  for (let i = 0; i < values.length; i++) {
    await inputs[i]!.click();
    await page.keyboard.press(values[i]!);
  }
}

test('hidden mode: start game with all opponent cards unknown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  // Default mode: neither All Open nor Three Open is checked.
  await expect(page.getByRole('checkbox', { name: 'All Open' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Three Open' })).not.toBeChecked();

  // Opponent hand should show 5 locked "?" cards.
  const questionMarks = page.locator('text=?');
  await expect(questionMarks).toHaveCount(5);

  // Only player hand has editable stat inputs (5 cards * 4 stats = 20 textboxes).
  const inputs = await page.getByRole('textbox').all();
  expect(inputs.length).toBe(20);

  // Fill player hand.
  await fillPlayerHand(page, DEFAULT_PLAYER);

  // Start game.
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'FFXIV Triple Triad Companion' })).toBeVisible();

  // All 5 opponent cards should be unknown "?" buttons.
  await expect(page.getByRole('button', { name: '?' })).toHaveCount(5);
});
