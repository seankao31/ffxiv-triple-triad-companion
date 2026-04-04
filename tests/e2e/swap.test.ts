// ABOUTME: E2E test for the Swap rule flow — setup, swap phase, and game start.
// ABOUTME: Verifies that enabling Swap leads to the card exchange UI, and the game starts with swapped hands.
import { test, expect } from '@playwright/test';
import { fillHands, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('swap + three open: enter swap phase with unknown opponent cards', async ({ page }) => {
  await page.goto('/');

  // Enable both Swap and Three Open.
  await page.getByRole('checkbox', { name: 'Swap' }).click();
  await page.getByRole('checkbox', { name: 'Three Open' }).click();

  // Fill player hand (5 cards) + only 3 opponent cards (leave 2 unknown).
  const threeOpponentCards = DEFAULT_OPPONENT.slice(0, 3);
  await fillHands(page, DEFAULT_PLAYER, threeOpponentCards);

  // Start game — should enter swap phase.
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'Swap — Exchange Cards' })).toBeVisible();

  // Select a card to give and receive, confirm swap.
  const playerCard = page.getByRole('button', { name: '5 3 7 2' });
  const opponentCard = page.getByRole('button', { name: '4 5 6 3' });
  await playerCard.click();
  await opponentCard.click();
  await page.getByRole('button', { name: /confirm swap/i }).click();

  // Should transition to play phase.
  await expect(page.getByRole('heading', { name: 'Project Triad' })).toBeVisible();
});

test('swap + three open: swap with unknown opponent card by entering stats', async ({ page }) => {
  await page.goto('/');

  // Enable both Swap and Three Open.
  await page.getByRole('checkbox', { name: 'Swap' }).click();
  await page.getByRole('checkbox', { name: 'Three Open' }).click();

  // Fill player hand (5 cards) + only 3 opponent cards (leave 2 unknown).
  const threeOpponentCards = DEFAULT_OPPONENT.slice(0, 3);
  await fillHands(page, DEFAULT_PLAYER, threeOpponentCards);

  // Start game — enter swap phase.
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'Swap — Exchange Cards' })).toBeVisible();

  // Unknown opponent slots should appear as "?" buttons.
  const unknownButtons = page.getByRole('button', { name: '?' });
  await expect(unknownButtons.first()).toBeVisible();

  // Select a player card to give away.
  await page.getByRole('button', { name: '5 3 7 2' }).click();

  // Click an unknown "?" opponent card — should open a CardInput for entering stats.
  await unknownButtons.first().click();
  await expect(page.getByRole('textbox', { name: 'Top' })).toBeVisible();

  // Enter stats: 9/8/7/6 (top/right/bottom/left).
  await page.keyboard.press('9');
  await page.keyboard.press('8');
  await page.keyboard.press('7');
  await page.keyboard.press('6');

  // After entering all 4 stats, the card should be revealed and selected.
  // Confirm Swap should now be enabled.
  await expect(page.getByRole('button', { name: /confirm swap/i })).toBeEnabled();

  // Confirm the swap.
  await page.getByRole('button', { name: /confirm swap/i }).click();

  // Should transition to play phase.
  await expect(page.getByRole('heading', { name: 'Project Triad' })).toBeVisible();

  // Player hand should contain the received card (9/8/7/6).
  await expect(page.getByRole('button', { name: '9 8 7 6' })).toBeVisible();
});

test('swap flow: enable swap, exchange cards, and start game with swapped hands', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  // Enable Swap rule.
  await page.getByRole('checkbox', { name: 'Swap' }).click();
  await expect(page.getByRole('checkbox', { name: 'Swap' })).toBeChecked();

  // Fill both hands.
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);

  // Start game — should enter swap phase, not play phase.
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'Swap — Exchange Cards' })).toBeVisible();

  // Confirm Swap should be disabled until both cards are selected.
  const confirmBtn = page.getByRole('button', { name: /confirm swap/i });
  await expect(confirmBtn).toBeDisabled();

  // Player hand card labels (top right bottom left): from DEFAULT_PLAYER
  // Card 0: 5 3 7 2
  const playerCard = page.getByRole('button', { name: '5 3 7 2' });
  // Opponent hand card labels: from DEFAULT_OPPONENT
  // Card 1: 7 3 5 4
  const opponentCard = page.getByRole('button', { name: '7 3 5 4' });

  // Select which card to give away (player card 0).
  await playerCard.click();
  await expect(confirmBtn).toBeDisabled(); // still need to pick a received card

  // Select which card to receive (opponent card 1).
  await opponentCard.click();
  await expect(confirmBtn).toBeEnabled();

  // Confirm the swap.
  await confirmBtn.click();

  // Should transition to play phase.
  await expect(page.getByRole('heading', { name: 'Project Triad' })).toBeVisible();

  // Player hand should contain the received card (7/3/5/4) instead of the given card (5/3/7/2).
  await expect(page.getByRole('heading', { name: /your hand/i })).toBeVisible();
  // The received card (7 3 5 4) should appear in the player's hand panel.
  await expect(page.getByRole('button', { name: '7 3 5 4' })).toBeVisible();
});
