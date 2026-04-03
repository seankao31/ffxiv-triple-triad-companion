// ABOUTME: E2E test for the full game flow — setup through game completion.
// ABOUTME: Verifies that filling hands, starting, and placing all 9 cards reaches a final score.
import { test, expect } from '@playwright/test';
import { fillHands, placeCard, DEFAULT_PLAYER, DEFAULT_OPPONENT } from './helpers';

test('full game flow from setup to completion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

  // Fill both hands and start game.
  await fillHands(page, DEFAULT_PLAYER, DEFAULT_OPPONENT);
  await page.getByRole('button', { name: 'Start Game' }).click();

  await expect(page.getByRole('heading', { name: 'Project Triad' })).toBeVisible();

  // Player goes first → 5 player turns (1,3,5,7,9), 4 opponent turns (2,4,6,8).
  // Always click the first empty cell (nth(0)) — earlier placements shrink the "·" list.
  const playerCards = ['5 3 7 2', '4 6 2 8', '3 5 5 7', '6 4 3 9', '7 2 8 1'];
  const opponentCards = ['4 5 6 3', '7 3 5 4', '2 8 1 6', '5 5 5 5'];

  for (let turn = 0; turn < 9; turn++) {
    const isPlayerTurn = turn % 2 === 0;
    const hand = isPlayerTurn ? playerCards : opponentCards;
    const cardIndex = isPlayerTurn ? turn / 2 : (turn - 1) / 2;
    await placeCard(page, hand[cardIndex]!, 0);
  }

  // Game over — score text should still be visible with final tally.
  const scoreText = page.locator('text=/You: \\d+ — Opponent: \\d+/');
  await expect(scoreText).toBeVisible();

  // All 9 cells filled — no empty cells remain.
  await expect(page.getByRole('button', { name: '·' })).toHaveCount(0);
});
