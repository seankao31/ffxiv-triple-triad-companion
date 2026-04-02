// ABOUTME: Tests for HandPanel — renders remaining cards, highlights best move, handles selection.
// ABOUTME: Uses asymmetric hands for fast solver termination.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, playCard, rankedMoves, currentState, updateThreeOpen, revealCard, updateRuleset } from '../../../src/app/store';
import HandPanel from '../../../src/app/components/game/HandPanel.svelte';
import { createCard, Owner, CardType, type Card, type RankedMove, resetCardIds } from '../../../src/engine';

// Constructs all 45 ranked moves (5 cards × 9 positions) as wins, mirroring what the solver
// returns for all-10s vs all-1s hands. Used to populate rankedMoves without invoking the solver.
function makeAllMoves(hand: readonly Card[]): RankedMove[] {
  return hand.flatMap((card) =>
    Array.from({ length: 9 }, (_, position) => ({ card, position, score: 7, robustness: 1 }))
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

describe('unknown card reveal', () => {
  function setupWithUnknown() {
    updateThreeOpen(true);
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.set({
      phase: 'setup',
      ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
      swap: false,
      threeOpen: true,
      playerHand: ph,
      opponentHand: [oh[0]!, oh[1]!, oh[2]!, oh[3]!, null],
      firstTurn: Owner.Opponent,
      history: [],
      selectedCard: null,
      unknownCardIds: new Set(),
    });
    startGame();
    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
  }

  it('clicking "?" on opponent turn opens a CardInput reveal form', async () => {
    setupWithUnknown();
    render(HandPanel, { props: { owner: Owner.Opponent } });
    const unknownButton = screen.getByText('?').closest('button')!;
    await fireEvent.click(unknownButton);
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
  });

  it('reveal form auto-focuses the Top field after opening', async () => {
    setupWithUnknown();
    render(HandPanel, { props: { owner: Owner.Opponent } });
    await fireEvent.click(screen.getByText('?').closest('button')!);
    expect(document.activeElement).toBe(screen.getByLabelText('Top'));
  });

  it('completing CardInput calls revealCard and closes the form', async () => {
    setupWithUnknown();
    render(HandPanel, { props: { owner: Owner.Opponent } });
    await fireEvent.click(screen.getByText('?').closest('button')!);

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '5' });

    expect(screen.queryByLabelText('Top')).not.toBeInTheDocument();
    expect(get(game).unknownCardIds.size).toBe(0);
  });

  it('clicking "?" on player turn does not open reveal form', async () => {
    const state = get(currentState)!;
    const opponentCardId = state.opponentHand[0]!.id;
    game.update((g) => ({ ...g, unknownCardIds: new Set([opponentCardId]) }));

    render(HandPanel, { props: { owner: Owner.Opponent } });
    const unknownButton = screen.getByText('?').closest('button')!;
    await fireEvent.click(unknownButton);

    expect(screen.queryByLabelText('Top')).not.toBeInTheDocument();
  });
});

describe('HandPanel', () => {
  it('renders 5 cards for the player hand', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('sets selectedCard when a card is clicked on the active turn', async () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(get(game).selectedCard).not.toBeNull();
  });

  it('does not set selectedCard when the inactive hand is clicked', async () => {
    render(HandPanel, { props: { owner: Owner.Opponent } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(get(game).selectedCard).toBeNull();
  });

  it('highlights the card matching the top ranked move', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    const highlighted = screen
      .getAllByRole('button')
      .filter((b) => b.classList.contains('ring-2'));
    expect(highlighted.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "?" placeholder for cards in unknownCardIds', () => {
    const state = get(currentState)!;
    const unknownId = state.opponentHand[0]!.id;
    game.update((g) => ({ ...g, unknownCardIds: new Set([unknownId]) }));
    render(HandPanel, { props: { owner: Owner.Opponent } });
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('highlights the best-move card when moves come from a deserialized source (Worker)', () => {
    // Simulate Worker structured-clone: card.id is a primitive number and survives deserialization
    const moves = makeAllMoves(get(currentState)!.playerHand);
    rankedMoves.set(JSON.parse(JSON.stringify(moves)));

    render(HandPanel, { props: { owner: Owner.Player } });
    const highlighted = screen
      .getAllByRole('button')
      .filter((b) => b.classList.contains('ring-2'));
    expect(highlighted.length).toBeGreaterThanOrEqual(1);
  });
});

describe('HandPanel type label', () => {
  it('shows type abbreviation for typed cards in hand', () => {
    // Set up with typed cards
    resetCardIds();
    const ph = [
      createCard(10, 10, 10, 10, CardType.Primal),
      createCard(10, 10, 10, 10, CardType.Scion),
      createCard(10, 10, 10, 10, CardType.Society),
      createCard(10, 10, 10, 10, CardType.Garlean),
      createCard(10, 10, 10, 10),
    ];
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
    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));

    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('Sc')).toBeInTheDocument();
    expect(screen.getByText('So')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });
});

describe('HandPanel modifier', () => {
  it('shows modifier for typed cards when Ascension is active and same-type cards are on the board', () => {
    resetCardIds();
    const primal1 = createCard(10, 10, 10, 10, CardType.Primal);
    const primal2 = createCard(10, 10, 10, 10, CardType.Primal);
    const ph = [primal1, primal2, createCard(10, 10, 10, 10), createCard(10, 10, 10, 10), createCard(10, 10, 10, 10)];
    const oh = makeOpponentHand();
    game.set({
      phase: 'setup',
      ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: true, descension: false },
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

    // Place primal1 at position 0 (now a Primal card is on the board)
    const freshHand = get(currentState)!.playerHand;
    selectCard(freshHand[0]!);
    playCard(0);

    rankedMoves.set(makeAllMoves(get(currentState)!.opponentHand));

    // Render player hand — primal2 should show +1 modifier
    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('does not show modifier when Ascension/Descension are not active', () => {
    // Default setup has no ascension/descension — already tested by existing tests
    // that don't expect modifier text. Just verify explicitly.
    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.queryByText(/^\+\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d$/)).not.toBeInTheDocument();
  });
});
