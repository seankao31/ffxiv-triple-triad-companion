// ABOUTME: E2E tests for the Three Open rule — unknown opponent cards and mid-game reveal.
// ABOUTME: Verifies setup with partial opponent hand, unknown card display, and the reveal-then-place flow.
import { test, expect } from '@playwright/test';
import { type CardStats, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

/**
 * Fill only the player hand (first 20 textbox inputs) and optionally
 * some opponent cards. Opponent slots beyond `opponentCards` are left empty.
 */
async function fillPlayerAndPartialOpponent(
  page: import('@playwright/test').Page,
  playerCards: CardStats[],
  opponentCards: CardStats[],
): Promise<void> {
  const values = [...playerCards.flat(), ...opponentCards.flat()];
  const inputs = await page.getByRole('textbox').all();
  for (let i = 0; i < values.length; i++) {
    await inputs[i]!.click();
    await page.keyboard.press(values[i]!);
  }
}

test('three open: start game with unknown opponent cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  // Enable Three Open rule.
  await page.getByRole('checkbox', { name: 'Three Open' }).click();
  await expect(page.getByRole('checkbox', { name: 'Three Open' })).toBeChecked();

  // Fill player hand fully, fill only 3 of 5 opponent cards.
  await fillPlayerAndPartialOpponent(page, DEFAULT_PLAYER, DEFAULT_OPPONENT.slice(0, 3));

  // Start game — should succeed despite 2 empty opponent slots.
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'Project Triad' })).toBeVisible();

  // Opponent hand should show 2 unknown cards as "?" buttons.
  await expect(page.getByRole('button', { name: '?' })).toHaveCount(2);

  // The 3 known opponent cards should be visible.
  await expect(page.getByRole('button', { name: '4 5 6 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: '7 3 5 4' })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 8 1 6' })).toBeVisible();
});

test('three open: reveal unknown card and place it', async ({ page }) => {
  await page.goto('/');

  // Enable Three Open with ALL opponent cards unknown for immediate reveal on turn 2.
  await page.getByRole('checkbox', { name: 'Three Open' }).click();

  // Fill player hand only — no opponent cards.
  await fillPlayerAndPartialOpponent(page, DEFAULT_PLAYER, []);

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'Project Triad' })).toBeVisible();

  // All 5 opponent cards should be unknown.
  await expect(page.getByRole('button', { name: '?' })).toHaveCount(5);

  // Turn 1 (Player): place a card.
  await page.getByRole('button', { name: '5 3 7 2' }).click();
  await page.getByRole('button', { name: '·' }).first().click();
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(8);

  // Turn 2 (Opponent): click an unknown card — should open reveal CardInput.
  await page.getByRole('button', { name: '?' }).first().click();

  // A CardInput should appear with 4 stat textboxes.
  const statInputs = await page.getByRole('textbox').all();
  expect(statInputs.length).toBe(4);

  // Type stats to reveal: 6 2 7 4 (top, right, bottom, left).
  await statInputs[0]!.click();
  await page.keyboard.press('6');
  await page.keyboard.press('2');
  await page.keyboard.press('7');
  await page.keyboard.press('4');

  // Card is now revealed — the "?" count should drop by 1.
  await expect(page.getByRole('button', { name: '?' })).toHaveCount(4);

  // The revealed card should be visible. Auto-advance types into Top→Right→Bottom→Left,
  // creating card top=6, right=2, bottom=7, left=4. The grid renders in DOM order
  // (top, left, right, bottom) so the accessible name is "6 4 2 7".
  const revealedCard = page.getByRole('button', { name: '6 4 2 7' });
  await expect(revealedCard).toBeVisible();

  // Click the revealed card to select it, then place on the board.
  await revealedCard.click();
  await page.getByRole('button', { name: '·' }).first().click();

  // Board should now have 7 empty cells (2 cards placed).
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(7);
});
