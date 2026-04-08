// ABOUTME: Shared helpers for E2E tests — hand filling and board interaction.
// ABOUTME: Provides fillHands() to populate all 10 card slots via keyboard input.
import type { Page } from '@playwright/test';

/** Card stat values: [top, right, bottom, left] */
export type CardStats = [string, string, string, string];

/**
 * Fill both player and opponent hands by clicking each input and pressing keys.
 * Inputs are readonly and use keydown handlers, so we click + keyboard.press.
 */
export async function fillHands(
  page: Page,
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

/** Click a card in a hand panel by its stat label (e.g. "5 3 7 2"). */
export async function selectCard(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label }).click();
}

/** Click the Nth empty board cell (0-indexed). */
export async function clickCell(page: Page, index: number): Promise<void> {
  await page.getByRole('button', { name: '·' }).nth(index).click();
}

/** Place a card: select it from hand, then click a board cell. */
export async function placeCard(
  page: Page,
  cardLabel: string,
  cellIndex: number,
): Promise<void> {
  await selectCard(page, cardLabel);
  await clickCell(page, cellIndex);
}

/** Enable the All Open visibility rule by clicking the checkbox. */
export async function enableAllOpen(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'All Open' }).click();
}

/** Default test hands — distinct stats for easy identification. */
export const DEFAULT_PLAYER: CardStats[] = [
  ['5', '3', '7', '2'],
  ['4', '6', '2', '8'],
  ['3', '5', '5', '7'],
  ['6', '4', '3', '9'],
  ['7', '2', '8', '1'],
];

export const DEFAULT_OPPONENT: CardStats[] = [
  ['4', '5', '6', '3'],
  ['7', '3', '5', '4'],
  ['2', '8', '1', '6'],
  ['5', '5', '5', '5'],
  ['3', '6', '4', '7'],
];
