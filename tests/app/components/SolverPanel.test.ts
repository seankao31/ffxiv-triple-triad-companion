// ABOUTME: Tests for SolverPanel — displays ranked move suggestions with outcomes.
// ABOUTME: Uses asymmetric hands for fast solver termination.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, screen } from '@testing-library/svelte';
import { game, startGame, currentState, selectCard, playCard, rankedMoves, solverLoading, pimcProgress } from '../../../src/app/store';
import SolverPanel from '../../../src/app/components/game/SolverPanel.svelte';
import { createCard, Owner, Outcome, type Card, type RankedMove } from '../../../src/engine';

// Constructs all 45 ranked moves (5 cards × 9 positions) as wins, mirroring what the solver
// returns for all-10s vs all-1s hands. Used to populate rankedMoves without invoking the solver.
function makeAllMoves(hand: readonly Card[]): RankedMove[] {
  return hand.flatMap((card) =>
    Array.from({ length: 9 }, (_, position) => ({ card, position, outcome: Outcome.Win, robustness: 1 }))
  );
}

function makePlayerHand() {
  return Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
}

function makeOpponentHand() {
  return Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
}

beforeEach(() => {
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    swap: false,
    threeOpen: false,
    playerHand: ph,
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
  });
  startGame();
  // Worker is mocked — populate rankedMoves directly for component tests.
  rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
});

describe('SolverPanel', () => {
  it('renders a list of move suggestions', () => {
    render(SolverPanel);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('shows outcome label once in the header area, not per row', () => {
    const card = createCard(10, 10, 10, 10);
    rankedMoves.set([
      { card, position: 0, outcome: Outcome.Win, robustness: 0.8 },
      { card, position: 1, outcome: Outcome.Win, robustness: 0.5 },
    ]);
    render(SolverPanel);
    const items = screen.getAllByRole('listitem');
    for (const item of items) {
      expect(item.textContent).not.toMatch(/win|draw|loss/i);
    }
    expect(document.body.textContent).toMatch(/win|draw|loss/i);
  });

  it('renders the first move with a distinct highlight class', () => {
    const { container } = render(SolverPanel);
    const items = container.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    // First item should have ring-1 (top move highlight)
    expect(items[0]!.classList.contains('ring-1')).toBe(true);
  });

  it('displays card values in move notation (e.g. "A-A-A-A")', () => {
    render(SolverPanel);
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('A-A-A-A');
  });

  it('shows only moves with the best outcome when outcomes differ', () => {
    const card = createCard(10, 10, 10, 10);
    rankedMoves.set([
      { card, position: 0, outcome: Outcome.Win, robustness: 0.8 },
      { card, position: 1, outcome: Outcome.Win, robustness: 0.5 },
      { card, position: 2, outcome: Outcome.Draw, robustness: 0.3 },
      { card, position: 3, outcome: Outcome.Loss, robustness: 0.1 },
    ]);
    render(SolverPanel);
    expect(screen.getAllByRole('listitem').length).toBe(2);
  });

  it('shows "Best Moves" header on player turn', () => {
    render(SolverPanel);
    // It's player's turn at game start
    expect(screen.getByText('Best Moves')).toBeInTheDocument();
  });

  it('shows a loading indicator when solverLoading is true', () => {
    solverLoading.set(true);
    render(SolverPanel);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('hides the loading indicator when solverLoading is false', () => {
    solverLoading.set(false);
    render(SolverPanel);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows "Opponent" in header on opponent turn', () => {
    // Play one move so it becomes opponent's turn
    const state = get(currentState);
    expect(state).not.toBeNull();
    const ph = state!.playerHand;
    selectCard(ph[0]!);
    playCard(0);
    render(SolverPanel);
    // After one player move, it's opponent's turn
    expect(screen.getByText(/opponent/i)).toBeInTheDocument();
  });

  it('shows PIMC simulation progress when pimcProgress is set', () => {
    pimcProgress.set({ current: 10, total: 50 });
    render(SolverPanel);
    expect(screen.getByText(/10.*50/)).toBeInTheDocument();
  });

  it('shows confidence percentage when move has confidence field', () => {
    const card = createCard(10, 10, 10, 10);
    rankedMoves.set([
      { card, position: 0, outcome: Outcome.Win, robustness: 0, confidence: 0.72 },
    ]);
    render(SolverPanel);
    expect(screen.getByRole('listitem').textContent).toMatch(/72%/);
  });

  it('shows robustness when confidence is null (JSON-deserialized from Rust None)', () => {
    const card = createCard(10, 10, 10, 10);
    // Rust Option<f64>::None serializes to JSON null; JSON.parse preserves null (not undefined).
    rankedMoves.set([
      { card, position: 0, outcome: Outcome.Draw, robustness: 0.5, confidence: null } as unknown as RankedMove,
    ]);
    render(SolverPanel);
    const text = screen.getByRole('listitem').textContent!;
    expect(text).toContain('50%');
  });

  it('hides robustness for winning moves in All Open mode', () => {
    const card = createCard(10, 10, 10, 10);
    rankedMoves.set([
      { card, position: 0, outcome: Outcome.Win, robustness: 0, confidence: null } as unknown as RankedMove,
    ]);
    render(SolverPanel);
    const text = screen.getByRole('listitem').textContent!;
    expect(text).not.toContain('%');
  });
});
