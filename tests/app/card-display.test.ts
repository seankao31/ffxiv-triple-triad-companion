// ABOUTME: Tests for card display helpers — type abbreviation maps and board type counting.
// ABOUTME: Validates boardTypeCount against various board configurations.
import { describe, it, expect } from 'vitest';
import { boardTypeCount, typeAbbrev, typeColor, cardModifier } from '../../src/app/card-display';
import { CardType, Owner, createInitialState, createCard, resetCardIds, type GameState } from '../../src/engine';
import { placeCard } from '../../src/engine';

function emptyState(): GameState {
  resetCardIds();
  const ph = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
  const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
  return createInitialState(ph, oh);
}

describe('typeAbbrev', () => {
  it('maps Primal to P', () => {
    expect(typeAbbrev[CardType.Primal]).toBe('P');
  });

  it('maps Scion to Sc', () => {
    expect(typeAbbrev[CardType.Scion]).toBe('Sc');
  });

  it('maps Society to So', () => {
    expect(typeAbbrev[CardType.Society]).toBe('So');
  });

  it('maps Garlean to G', () => {
    expect(typeAbbrev[CardType.Garlean]).toBe('G');
  });

  it('returns undefined for None', () => {
    expect(typeAbbrev[CardType.None]).toBeUndefined();
  });
});

describe('typeColor', () => {
  it('maps Primal to text-type-primal', () => {
    expect(typeColor[CardType.Primal]).toBe('text-type-primal');
  });
});

describe('boardTypeCount', () => {
  it('returns 0 for an empty board', () => {
    const state = emptyState();
    expect(boardTypeCount(state, CardType.Primal)).toBe(0);
  });

  it('counts cards of the given type on the board', () => {
    resetCardIds();
    const primal1 = createCard(5, 5, 5, 5, CardType.Primal);
    const primal2 = createCard(5, 5, 5, 5, CardType.Primal);
    const scion = createCard(5, 5, 5, 5, CardType.Scion);
    const ph = [primal1, primal2, scion, createCard(5, 5, 5, 5), createCard(5, 5, 5, 5)];
    const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
    let state = createInitialState(ph, oh);
    // Place primal1 at position 0
    state = placeCard(state, primal1, 0);
    // Place an opponent card at position 1
    state = placeCard(state, oh[0]!, 1);
    // Place primal2 at position 2
    state = placeCard(state, primal2, 2);

    expect(boardTypeCount(state, CardType.Primal)).toBe(2);
    expect(boardTypeCount(state, CardType.Scion)).toBe(0);
    expect(boardTypeCount(state, CardType.None)).toBe(1); // opponent's None-type card
  });

  it('returns 0 for CardType.None when no None-type cards are on the board', () => {
    resetCardIds();
    const primal = createCard(5, 5, 5, 5, CardType.Primal);
    const ph = [primal, createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5)];
    const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5, CardType.Scion));
    let state = createInitialState(ph, oh);
    state = placeCard(state, primal, 0);
    expect(boardTypeCount(state, CardType.None)).toBe(0);
  });
});

describe('cardModifier', () => {
  const noRules = { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false };

  it('returns null for CardType.None even when None-type cards are on the board', () => {
    resetCardIds();
    const none = createCard(5, 5, 5, 5); // CardType.None by default
    const ph = [none, createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5)];
    const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
    let state = createInitialState(ph, oh);
    state = placeCard(state, none, 0);
    expect(cardModifier(CardType.None, state, { ...noRules, ascension: true })).toBeNull();
  });

  it('returns null when neither ascension nor descension is active', () => {
    const state = emptyState();
    expect(cardModifier(CardType.Primal, state, noRules)).toBeNull();
  });

  it('returns positive count for ascension', () => {
    resetCardIds();
    const primal = createCard(5, 5, 5, 5, CardType.Primal);
    const ph = [primal, createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5)];
    const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
    let state = createInitialState(ph, oh);
    state = placeCard(state, primal, 0);
    expect(cardModifier(CardType.Primal, state, { ...noRules, ascension: true })).toBe(1);
  });

  it('returns negative count for descension', () => {
    resetCardIds();
    const primal = createCard(5, 5, 5, 5, CardType.Primal);
    const ph = [primal, createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5)];
    const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
    let state = createInitialState(ph, oh);
    state = placeCard(state, primal, 0);
    expect(cardModifier(CardType.Primal, state, { ...noRules, descension: true })).toBe(-1);
  });

  it('returns null when no cards of the type are on the board', () => {
    const state = emptyState();
    expect(cardModifier(CardType.Primal, state, { ...noRules, ascension: true })).toBeNull();
  });
});
