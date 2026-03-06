// ABOUTME: Central Svelte store for the Live Solver app.
// ABOUTME: Holds game phase, hands, ruleset, history stack, and selected card.
import { writable, derived, get } from 'svelte/store';
import {
  createInitialState, placeCard as enginePlaceCard, findBestMove,
  Owner,
  type Card, type GameState, type RuleSet, type RankedMove,
} from '../engine';

export type Phase = 'setup' | 'play';

export type AppState = {
  phase: Phase;
  ruleset: RuleSet;
  playerHand: (Card | null)[];
  opponentHand: (Card | null)[];
  history: GameState[];
  firstTurn: Owner;
  selectedCard: Card | null;
};

const initialAppState: AppState = {
  phase: 'setup',
  ruleset: { plus: false, same: false },
  playerHand: [null, null, null, null, null],
  opponentHand: [null, null, null, null, null],
  firstTurn: Owner.Player,
  history: [],
  selectedCard: null,
};

export const game = writable<AppState>(initialAppState);

export const currentState = derived(game, ($g) => $g.history.at(-1) ?? null);

export const rankedMoves = derived(currentState, ($state): RankedMove[] =>
  $state ? findBestMove($state) : [],
);

export function updatePlayerCard(index: number, card: Card | null): void {
  game.update((s) => {
    const playerHand = [...s.playerHand];
    playerHand[index] = card;
    return { ...s, playerHand };
  });
}

export function updateOpponentCard(index: number, card: Card | null): void {
  game.update((s) => {
    const opponentHand = [...s.opponentHand];
    opponentHand[index] = card;
    return { ...s, opponentHand };
  });
}

export function updateRuleset(ruleset: RuleSet): void {
  game.update((s) => ({ ...s, ruleset }));
}

export function updateFirstTurn(turn: Owner): void {
  game.update((s) => ({ ...s, firstTurn: turn }));
}

export function startGame(): void {
  const s = get(game);
  if (s.playerHand.some((c) => c === null) || s.opponentHand.some((c) => c === null)) {
    throw new Error('All hand slots must be filled before starting the game.');
  }
  game.update((s) => {
    const initial = createInitialState(
      s.playerHand as Card[],
      s.opponentHand as Card[],
      s.firstTurn,
      s.ruleset,
    );
    return { ...s, phase: 'play', history: [initial] };
  });
}

export function selectCard(card: Card | null): void {
  game.update((s) => ({ ...s, selectedCard: card }));
}

export function playCard(position: number): void {
  game.update((s) => {
    if (!s.selectedCard) return s;
    const state = s.history.at(-1);
    if (!state) return s;

    const next = enginePlaceCard(state, s.selectedCard, position);
    return { ...s, history: [...s.history, next], selectedCard: null };
  });
}

export function undoMove(): void {
  game.update((s) => {
    const history = s.history.slice(0, -1);
    const phase: Phase = history.length === 0 ? 'setup' : 'play';
    return { ...s, history, phase };
  });
}
