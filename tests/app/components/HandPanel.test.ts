// ABOUTME: Tests for HandPanel — fixed hand slots, ghost slots for played cards, highlights best move, handles selection.
// ABOUTME: Uses asymmetric hands for fast solver termination.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, playCard, undoMove, rankedMoves, currentState, updateThreeOpen, revealCard, updateRuleset } from '../../../src/app/store';
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
  return [createCard(10, 8, 6, 4), createCard(9, 7, 5, 3), createCard(8, 6, 10, 2), createCard(7, 10, 4, 8), createCard(6, 5, 9, 7)];
}

function makeOpponentHand() {
  return [createCard(1, 3, 5, 2), createCard(2, 4, 1, 6), createCard(3, 1, 2, 4), createCard(4, 2, 6, 1), createCard(5, 6, 3, 3)];
}

beforeEach(() => {
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
    swap: false,
    threeOpen: false,
    allOpen: true,
    playerHand: ph,
    setupPlayerHand: [null, null, null, null, null],
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
    playerSide: 'left',
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
      ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
      swap: false,
      threeOpen: true,
      allOpen: false,
      playerHand: ph,
      setupPlayerHand: [null, null, null, null, null],
      opponentHand: [oh[0]!, oh[1]!, oh[2]!, null, null],
      firstTurn: Owner.Opponent,
      history: [],
      selectedCard: null,
      unknownCardIds: new Set(),
      playerSide: 'left',
    });
    startGame();
    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
  }

  it('clicking "?" on opponent turn opens a CardInput reveal form', async () => {
    setupWithUnknown();
    render(HandPanel, { props: { owner: Owner.Opponent } });
    const unknownButton = screen.getAllByText('?')[0]!.closest('button')!;
    await fireEvent.click(unknownButton);
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
  });

  it('reveal form auto-focuses the Top field after opening', async () => {
    setupWithUnknown();
    render(HandPanel, { props: { owner: Owner.Opponent } });
    await fireEvent.click(screen.getAllByText('?')[0]!.closest('button')!);
    expect(document.activeElement).toBe(screen.getByLabelText('Top'));
  });

  it('completing CardInput calls revealCard and closes the form', async () => {
    setupWithUnknown();
    render(HandPanel, { props: { owner: Owner.Opponent } });
    await fireEvent.click(screen.getAllByText('?')[0]!.closest('button')!);

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '5' });

    expect(screen.queryByLabelText('Top')).not.toBeInTheDocument();
    expect(get(game).unknownCardIds.size).toBe(1);
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

  it('renders a ghost slot after a card is played', () => {
    // Play the first player card at position 0
    const hand = get(currentState)!.playerHand;
    selectCard(hand[0]!);
    playCard(0);
    // Opponent's turn — play opponent card at position 1 so it's player turn again
    const oppHand = get(currentState)!.opponentHand;
    selectCard(oppHand[0]!);
    playCard(1);

    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
    render(HandPanel, { props: { owner: Owner.Player } });

    // 4 remaining cards are buttons; 1 played card is a ghost slot
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getAllByTestId('empty-hand-slot')).toHaveLength(1);
  });

  it('restores a card to its original slot after undo', () => {
    const hand = get(currentState)!.playerHand;
    selectCard(hand[0]!);
    playCard(0);
    const oppHand = get(currentState)!.opponentHand;
    selectCard(oppHand[0]!);
    playCard(1);

    undoMove();
    undoMove();

    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
    render(HandPanel, { props: { owner: Owner.Player } });

    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.queryByTestId('empty-hand-slot')).toBeNull();
  });

  it('renders no slots when history is empty (setup phase)', () => {
    game.update((s) => ({ ...s, phase: 'setup', history: [] }));
    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('empty-hand-slot')).toBeNull();
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
      ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
      swap: false,
      threeOpen: false,
      allOpen: true,
      playerHand: ph,
      setupPlayerHand: [null, null, null, null, null],
      opponentHand: oh,
      firstTurn: Owner.Player,
      history: [],
      selectedCard: null,
      unknownCardIds: new Set(),
      playerSide: 'left',
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
    const primal1 = createCard(10, 8, 6, 4, CardType.Primal);
    const primal2 = createCard(9, 7, 5, 3, CardType.Primal);
    const ph = [primal1, primal2, createCard(8, 6, 10, 2), createCard(7, 10, 4, 8), createCard(6, 5, 9, 7)];
    const oh = makeOpponentHand();
    game.set({
      phase: 'setup',
      ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: true, descension: false, order: false, chaos: false },
      swap: false,
      threeOpen: false,
      allOpen: true,
      playerHand: ph,
      setupPlayerHand: [null, null, null, null, null],
      opponentHand: oh,
      firstTurn: Owner.Player,
      history: [],
      selectedCard: null,
      unknownCardIds: new Set(),
      playerSide: 'left',
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

describe('HandPanel side color', () => {
  it('shows blue turn indicator when playerSide is left and player is active', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    const indicator = document.querySelector('[title="Active turn"]');
    expect(indicator?.classList.contains('bg-accent-blue')).toBe(true);
  });

  it('shows red turn indicator when playerSide is right and player is active', () => {
    game.update((s) => ({ ...s, playerSide: 'right' as const }));
    render(HandPanel, { props: { owner: Owner.Player } });
    const indicator = document.querySelector('[title="Active turn"]');
    expect(indicator?.classList.contains('bg-accent-red')).toBe(true);
  });

  it('shows blue selection border when playerSide is left', async () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    const selected = screen.getAllByRole('button').find((b) => b.classList.contains('border-accent-blue'));
    expect(selected).toBeDefined();
  });

  it('shows red selection border when playerSide is right', async () => {
    game.update((s) => ({ ...s, playerSide: 'right' as const }));
    render(HandPanel, { props: { owner: Owner.Player } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    const selected = screen.getAllByRole('button').find((b) => b.classList.contains('border-accent-red'));
    expect(selected).toBeDefined();
  });
});
