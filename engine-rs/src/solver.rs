// ABOUTME: Minimax solver with alpha-beta pruning and transposition table.
// ABOUTME: Returns moves ranked by outcome (Win > Draw > Loss) from the current player's perspective.

use std::collections::HashSet;
use crate::board::{place_card_mut, undo_place};
use crate::types::{Card, CardType, GameState, Outcome, Owner, RankedMove};

// Assigns a unique integer to each card based on its values and type for within-hand deduplication.
fn stats_key(c: &Card) -> u32 {
    let type_idx: u32 = match c.card_type {
        CardType::None    => 0,
        CardType::Primal  => 1,
        CardType::Scion   => 2,
        CardType::Society => 3,
        CardType::Garlean => 4,
    };
    c.top as u32 * 5000 + c.right as u32 * 500 + c.bottom as u32 * 50 + c.left as u32 * 5 + type_idx
}

// Encodes board + turn as a single u64 for use as a HashMap key.
// Each cell: 0 = empty, 2*idx-1 = card idx owned by player, 2*idx = card idx owned by opponent.
// Turn bit occupies bit 0 (0=player, 1=opponent). Cells packed starting at bit 1 (shift=2),
// 5 bits each (max cell value = (card.id+1)*2, must be < 32 — requires card.id < 15).
// In practice card.id is 0–9 per game (guaranteed by reset_card_ids() at game start).
// Total: 1 + 9*5 = 46 bits (safe integer).
fn hash_state(state: &GameState) -> u64 {
    let mut h: u64 = if state.current_turn == Owner::Player { 0 } else { 1 };
    let mut shift: u64 = 2;
    for cell in state.board.iter() {
        if let Some(placed) = cell {
            assert!(placed.card.id < 15, "card.id {} exceeds hash encoding limit", placed.card.id);
            let idx = placed.card.id as u64 + 1;
            h += (if placed.owner == Owner::Player { idx * 2 - 1 } else { idx * 2 }) * shift;
        }
        shift *= 32;
    }
    h
}

fn board_full(state: &GameState) -> bool {
    state.board.iter().all(|cell| cell.is_some())
}

// Evaluates terminal state score. Returns 1 for evaluating_for wins, -1 for loss, 0 for draw.
fn terminal_value(state: &GameState, evaluating_for: Owner) -> i32 {
    let (player, opponent) = crate::types::get_score(state);
    if player > opponent {
        if evaluating_for == Owner::Player { 1 } else { -1 }
    } else if player < opponent {
        if evaluating_for == Owner::Player { -1 } else { 1 }
    } else {
        0
    }
}

const TT_SIZE: usize = 1 << 22;
const EMPTY_KEY: u64 = u64::MAX;

#[derive(Clone, Copy)]
enum TTFlag {
    Exact,
    LowerBound,
    UpperBound,
}

#[derive(Clone, Copy)]
struct TTEntry {
    value: i32,
    flag: TTFlag,
}

// Flat array slot for the transposition table. key == EMPTY_KEY means unoccupied.
#[derive(Clone, Copy)]
struct TTSlot {
    key: u64,
    value: i32,
    flag: TTFlag,
}

// Returns 1 for win, 0 for draw, -1 for loss from evaluating_for's perspective.
fn minimax(
    state: &mut GameState,
    evaluating_for: Owner,
    mut alpha: i32,
    mut beta: i32,
    tt: &mut Vec<TTSlot>,
    occupied: &mut usize,
) -> i32 {
    let hand_len = if state.current_turn == Owner::Player {
        state.player_hand.len()
    } else {
        state.opponent_hand.len()
    };

    if hand_len == 0 || board_full(state) {
        return terminal_value(state, evaluating_for);
    }

    let key = hash_state(state);
    // Apply Fibonacci mixing before masking to distribute the polynomial hash uniformly.
    // hash_state uses base-32 encoding so low 22 bits alone would cluster mid-game positions.
    let tt_idx = (key.wrapping_mul(0x9e3779b97f4a7c15) >> (64 - 22)) as usize;
    let cached_slot = tt[tt_idx];
    let cached = if cached_slot.key == key {
        Some(TTEntry { value: cached_slot.value, flag: cached_slot.flag })
    } else {
        None
    };
    if let Some(entry) = cached {
        match entry.flag {
            TTFlag::Exact => return entry.value,
            TTFlag::LowerBound => {
                if entry.value >= beta { return entry.value; }
                if entry.value > alpha { alpha = entry.value; }
            }
            TTFlag::UpperBound => {
                if entry.value <= alpha { return entry.value; }
                if entry.value < beta { beta = entry.value; }
            }
        }
        if alpha >= beta { return entry.value; }
    }

    let is_maximizing = state.current_turn == evaluating_for;
    let orig_alpha = alpha;
    let orig_beta = beta;
    let mut best_value = if is_maximizing { i32::MIN } else { i32::MAX };

    // Clone hand to avoid borrow conflicts during mutation
    let hand_cards: Vec<Card> = if state.current_turn == Owner::Player {
        state.player_hand.clone()
    } else {
        state.opponent_hand.clone()
    };

    let mut seen_cards: HashSet<u32> = HashSet::new();

    'outer: for card in hand_cards.iter() {
        let ck = stats_key(card);
        if !seen_cards.insert(ck) { continue; }

        for i in 0..9usize {
            if state.board[i].is_some() { continue; }

            let undo = place_card_mut(state, *card, i);
            let value = minimax(state, evaluating_for, alpha, beta, tt, occupied);
            undo_place(state, undo);

            if is_maximizing {
                if value > best_value { best_value = value; }
                if value > alpha { alpha = value; }
            } else {
                if value < best_value { best_value = value; }
                if value < beta { beta = value; }
            }
            if alpha >= beta { break 'outer; }
        }
    }

    // Determine bound type based on whether alpha-beta narrowed the window
    let flag = if is_maximizing {
        if best_value <= orig_alpha { TTFlag::UpperBound }
        else if best_value >= beta  { TTFlag::LowerBound }
        else                        { TTFlag::Exact }
    } else {
        if best_value >= orig_beta  { TTFlag::LowerBound }
        else if best_value <= alpha { TTFlag::UpperBound }
        else                        { TTFlag::Exact }
    };

    if key != EMPTY_KEY {
        if tt[tt_idx].key == EMPTY_KEY { *occupied += 1; }
        tt[tt_idx] = TTSlot { key, value: best_value, flag };
    }
    best_value
}

fn find_best_move_with(state: &mut GameState, tt: &mut Vec<TTSlot>, occupied: &mut usize) -> Vec<RankedMove> {
    let hand_len = if state.current_turn == Owner::Player {
        state.player_hand.len()
    } else {
        state.opponent_hand.len()
    };

    if hand_len == 0 || board_full(state) {
        return vec![];
    }

    // All minimax calls use Owner::Player as evaluating_for so TT values are always from
    // Player's perspective. This makes TT entries safe to reuse across turns even when
    // the persistent solver is in use (current_turn flips each turn, but stored values
    // never change meaning).
    let current_is_player = state.current_turn == Owner::Player;

    // Clone hand before first pass to avoid borrow conflicts during mutation
    let hand_cards: Vec<Card> = if state.current_turn == Owner::Player {
        state.player_hand.clone()
    } else {
        state.opponent_hand.clone()
    };

    // First pass: evaluate all moves with minimax
    let mut evaluated: Vec<(Card, usize, i32)> = Vec::new();
    let mut seen_cards: HashSet<u32> = HashSet::new();

    for card in hand_cards.iter() {
        let ck = stats_key(card);
        if !seen_cards.insert(ck) { continue; }

        for i in 0..9usize {
            if state.board[i].is_some() { continue; }
            let undo = place_card_mut(state, *card, i);
            let value = minimax(state, Owner::Player, i32::MIN, i32::MAX, tt, occupied);
            undo_place(state, undo);
            evaluated.push((*card, i, value));
        }
    }

    // Second pass: calculate robustness for tie-breaking.
    // For each move, re-apply it, enumerate opponent responses, then undo.
    let mut moves: Vec<RankedMove> = evaluated
        .into_iter()
        .map(|(card, position, value)| {
            let undo = place_card_mut(state, card, position);

            // Clone opponent hand before inner loop to avoid borrow conflicts
            let opp_hand: Vec<Card> = if state.current_turn == Owner::Player {
                state.player_hand.clone()
            } else {
                state.opponent_hand.clone()
            };

            let mut total_responses: u32 = 0;
            let mut better_outcome_count: u32 = 0;

            for opp_card in opp_hand.iter() {
                for i in 0..9usize {
                    if state.board[i].is_some() { continue; }
                    total_responses += 1;
                    let inner_undo = place_card_mut(state, *opp_card, i);
                    let response_value =
                        minimax(state, Owner::Player, i32::MIN, i32::MAX, tt, occupied);
                    undo_place(state, inner_undo);
                    // "Better" means: better for the current player (original state.current_turn).
                    // Values are from Player's perspective: higher = better for Player.
                    if current_is_player {
                        if response_value > value { better_outcome_count += 1; }
                    } else {
                        if response_value < value { better_outcome_count += 1; }
                    }
                }
            }

            undo_place(state, undo);

            // value is from Player's perspective; flip sign when it's Opponent's turn.
            let effective_value = if current_is_player { value } else { -value };
            let outcome = match effective_value {
                1  => Outcome::Win,
                -1 => Outcome::Loss,
                _  => Outcome::Draw,
            };
            let robustness = if total_responses > 0 {
                better_outcome_count as f64 / total_responses as f64
            } else {
                0.0
            };

            RankedMove { card, position: position as u8, outcome, robustness, confidence: None }
        })
        .collect();

    // Sort: wins first, then draws, then losses; within same outcome, higher robustness first
    moves.sort_by(|a, b| {
        let order = |o: Outcome| match o {
            Outcome::Win  => 0,
            Outcome::Draw => 1,
            Outcome::Loss => 2,
        };
        let od = order(a.outcome).cmp(&order(b.outcome));
        if od != std::cmp::Ordering::Equal {
            od
        } else {
            b.robustness.partial_cmp(&a.robustness).unwrap_or(std::cmp::Ordering::Equal)
        }
    });

    moves
}

pub fn find_best_move(state: &GameState) -> Vec<RankedMove> {
    let mut tt = vec![TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact }; TT_SIZE];
    let mut occupied = 0;
    let mut state = state.clone();
    find_best_move_with(&mut state, &mut tt, &mut occupied)
}

pub struct Solver {
    tt: Vec<TTSlot>,
    tt_occupied: usize,
}

impl Solver {
    pub fn new() -> Self {
        Solver {
            tt: vec![TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact }; TT_SIZE],
            tt_occupied: 0,
        }
    }

    pub fn reset(&mut self) {
        self.tt.fill(TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact });
        self.tt_occupied = 0;
    }

    pub fn solve(&mut self, state: &GameState) -> Vec<RankedMove> {
        let mut state = state.clone();
        find_best_move_with(&mut state, &mut self.tt, &mut self.tt_occupied)
    }

    pub fn tt_size(&self) -> usize {
        self.tt_occupied
    }

    pub fn hash_for(&self, state: &GameState) -> u64 {
        hash_state(state)
    }
}

impl Default for Solver {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::place_card;
    use crate::types::{
        create_card, create_initial_state, reset_card_ids, Board, CardType, Owner, Outcome,
        PlacedCard, RuleSet,
    };

    fn no_rules() -> RuleSet {
        RuleSet::default()
    }

    // ---- findBestMove ----

    #[test]
    fn returns_no_moves_for_full_board() {
        reset_card_ids();
        let p = vec![
            create_card(1,1,1,1,CardType::None), create_card(2,2,2,2,CardType::None),
            create_card(3,3,3,3,CardType::None), create_card(4,4,4,4,CardType::None),
            create_card(5,5,5,5,CardType::None),
        ];
        let o = vec![
            create_card(6,6,6,6,CardType::None),   create_card(7,7,7,7,CardType::None),
            create_card(8,8,8,8,CardType::None),   create_card(9,9,9,9,CardType::None),
            create_card(10,10,10,10,CardType::None),
        ];
        let mut state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
        state = place_card(&state, p[0], 0);
        state = place_card(&state, o[0], 2);
        state = place_card(&state, p[1], 6);
        state = place_card(&state, o[1], 8);
        state = place_card(&state, p[2], 4);
        state = place_card(&state, o[2], 1);
        state = place_card(&state, p[3], 3);
        state = place_card(&state, o[3], 7);
        state = place_card(&state, p[4], 5);
        assert_eq!(find_best_move(&state).len(), 0);
    }

    #[test]
    fn finds_only_winning_move_in_late_game() {
        reset_card_ids();
        let p = vec![
            create_card(10,10,10,10,CardType::None), create_card(1,1,1,1,CardType::None),
            create_card(2,2,2,2,CardType::None),     create_card(3,3,3,3,CardType::None),
            create_card(4,4,4,4,CardType::None),
        ];
        let o = vec![
            create_card(1,1,1,1,CardType::None), create_card(5,5,5,5,CardType::None),
            create_card(6,6,6,6,CardType::None), create_card(7,7,7,7,CardType::None),
            create_card(8,8,8,8,CardType::None),
        ];
        let mut state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
        state = place_card(&state, p[1], 0);
        state = place_card(&state, o[0], 1);
        state = place_card(&state, p[2], 2);
        state = place_card(&state, o[1], 3);
        state = place_card(&state, p[3], 5);
        state = place_card(&state, o[2], 6);
        state = place_card(&state, p[4], 7);
        state = place_card(&state, o[3], 8);
        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0].position, 4);
        assert_eq!(moves[0].card.id, p[0].id);
    }

    #[test]
    fn ranks_winning_above_drawing_above_losing() {
        reset_card_ids();
        let p = vec![
            create_card(10,10,10,10,CardType::None), create_card(9,9,9,9,CardType::None),
            create_card(1,1,1,1,CardType::None),     create_card(2,2,2,2,CardType::None),
            create_card(3,3,3,3,CardType::None),
        ];
        let o = vec![
            create_card(5,5,5,5,CardType::None), create_card(6,6,6,6,CardType::None),
            create_card(7,7,7,7,CardType::None), create_card(8,8,8,8,CardType::None),
            create_card(4,4,4,4,CardType::None),
        ];
        let mut state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
        state = place_card(&state, p[2], 0);
        state = place_card(&state, o[0], 1);
        state = place_card(&state, p[3], 2);
        state = place_card(&state, o[1], 3);
        state = place_card(&state, p[4], 4);
        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 12);
        let order = |o: Outcome| match o { Outcome::Win => 0, Outcome::Draw => 1, Outcome::Loss => 2 };
        for i in 1..moves.len() {
            assert!(order(moves[i].outcome) >= order(moves[i - 1].outcome));
        }
    }

    // ---- tie-breaking ----

    #[test]
    fn prefers_draw_move_with_more_opponent_mistakes() {
        reset_card_ids();
        let filler    = create_card(1,  1,  1, 1, CardType::None);
        let pos4_card = create_card(1,  1, 10, 1, CardType::None);
        let p_card    = create_card(10, 10, 1, 10, CardType::None);
        let o1        = create_card(1,  1,  1, 1, CardType::None);
        let o2        = create_card(10, 10, 10, 10, CardType::None);

        let board: Board = [
            Some(PlacedCard { card: filler,    owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Opponent }),
            Some(PlacedCard { card: filler,    owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Opponent }),
            Some(PlacedCard { card: pos4_card, owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Player   }),
            Some(PlacedCard { card: filler,    owner: Owner::Opponent }),
            None,
            None,
        ];

        let state = GameState {
            board,
            player_hand: vec![p_card],
            opponent_hand: vec![o1, o2],
            current_turn: Owner::Player,
            rules: no_rules(),
        };

        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 2);
        assert!(moves.iter().all(|m| m.outcome == Outcome::Draw));
        assert_eq!(moves[0].position, 7);
        assert_eq!(moves[1].position, 8);
    }

    #[test]
    fn prefers_moves_with_higher_robustness() {
        reset_card_ids();
        let p: Vec<Card> = (0..5u8).map(|v| create_card(10 - v, 10 - v, 10 - v, 10 - v, CardType::None)).collect();
        let o: Vec<Card> = (0..5u8).map(|v| create_card(v + 1, v + 1, v + 1, v + 1, CardType::None)).collect();
        let state = create_initial_state(p, o, Owner::Player, no_rules());
        let moves = find_best_move(&state);
        let win_moves: Vec<_> = moves.iter().filter(|m| m.outcome == Outcome::Win).collect();
        assert!(win_moves.len() > 1);
        // Winning moves always have robustness=0 (nothing beats a win)
        for m in &win_moves {
            assert_eq!(m.robustness, 0.0);
        }
    }

    // ---- additional scenarios ----

    #[test]
    fn evaluates_from_current_players_perspective_when_opponent_goes_first() {
        reset_card_ids();
        let p: Vec<Card> = (0..5).map(|_| create_card(1,1,1,1,CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|_| create_card(10,10,10,10,CardType::None)).collect();
        let state = create_initial_state(p, o, Owner::Opponent, no_rules());
        let moves = find_best_move(&state);
        assert!(!moves.is_empty());
        assert!(moves.iter().all(|m| m.outcome == Outcome::Win));
    }

    #[test]
    fn returns_ranked_moves_when_all_outcomes_are_losses() {
        reset_card_ids();
        let weak   = create_card(1,1,1,1,CardType::None);
        let strong = create_card(10,10,10,10,CardType::None);

        let board: Board = [
            Some(PlacedCard { card: weak, owner: Owner::Player   }),
            Some(PlacedCard { card: weak, owner: Owner::Player   }),
            Some(PlacedCard { card: weak, owner: Owner::Opponent }),
            Some(PlacedCard { card: weak, owner: Owner::Opponent }),
            Some(PlacedCard { card: weak, owner: Owner::Opponent }),
            Some(PlacedCard { card: weak, owner: Owner::Opponent }),
            None, None, None,
        ];

        let state = GameState {
            board,
            player_hand: vec![weak],
            opponent_hand: vec![strong, strong],
            current_turn: Owner::Player,
            rules: no_rules(),
        };

        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 3);
        assert!(moves.iter().all(|m| m.outcome == Outcome::Loss));
        for i in 1..moves.len() {
            assert!(moves[i].robustness <= moves[i - 1].robustness);
        }
    }

    // ---- Solver struct ----

    #[test]
    fn solver_solve_matches_find_best_move() {
        reset_card_ids();
        let p: Vec<Card> = (0..5).map(|_| create_card(10,10,10,10,CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|_| create_card(1,1,1,1,CardType::None)).collect();
        let state = create_initial_state(p, o, Owner::Player, no_rules());
        let mut solver = Solver::new();
        solver.reset();
        let solver_moves = solver.solve(&state);
        let direct_moves = find_best_move(&state);
        let s_out: Vec<Outcome> = solver_moves.iter().map(|m| m.outcome).collect();
        let d_out: Vec<Outcome> = direct_moves.iter().map(|m| m.outcome).collect();
        assert_eq!(s_out, d_out);
        let s_pos: Vec<u8> = solver_moves.iter().map(|m| m.position).collect();
        let d_pos: Vec<u8> = direct_moves.iter().map(|m| m.position).collect();
        assert_eq!(s_pos, d_pos);
    }

    #[test]
    fn solver_reuses_tt_across_calls() {
        reset_card_ids();
        let p = vec![
            create_card(10,5,3,8,CardType::None), create_card(7,6,4,9,CardType::None),
            create_card(2,8,6,3,CardType::None),  create_card(5,4,7,1,CardType::None),
            create_card(9,3,2,6,CardType::None),
        ];
        let o = vec![
            create_card(4,7,5,2,CardType::None),  create_card(8,3,9,6,CardType::None),
            create_card(1,5,8,4,CardType::None),  create_card(6,9,1,7,CardType::None),
            create_card(3,2,4,10,CardType::None),
        ];
        let mut state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
        state = place_card(&state, p[2], 0);
        state = place_card(&state, o[0], 1);
        state = place_card(&state, p[3], 2);

        let mut solver = Solver::new();
        solver.reset();

        let t0 = std::time::Instant::now();
        solver.solve(&state);
        let first_us = t0.elapsed().as_micros();

        let t1 = std::time::Instant::now();
        solver.solve(&state);
        let second_us = t1.elapsed().as_micros();

        // Second call should be dramatically faster (all TT hits)
        assert!(
            second_us * 10 < first_us + 1,
            "TT not helping: first={first_us}µs second={second_us}µs"
        );
    }

    // ---- TT persistence ----

    #[test]
    fn tt_empty_after_reset() {
        let mut solver = Solver::new();
        solver.reset();
        assert_eq!(solver.tt_size(), 0);
    }

    #[test]
    fn tt_populated_after_solve() {
        reset_card_ids();
        let p: Vec<Card> = (0..5).map(|_| create_card(10,10,10,10,CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|_| create_card(1,1,1,1,CardType::None)).collect();
        let state = create_initial_state(p, o, Owner::Player, no_rules());
        let mut solver = Solver::new();
        solver.reset();
        solver.solve(&state);
        assert!(solver.tt_size() > 0);
    }

    #[test]
    fn tt_size_unchanged_solving_same_state_twice() {
        reset_card_ids();
        let p: Vec<Card> = (0..5).map(|_| create_card(10,10,10,10,CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|_| create_card(1,1,1,1,CardType::None)).collect();
        let state = create_initial_state(p, o, Owner::Player, no_rules());
        let mut solver = Solver::new();
        solver.reset();
        solver.solve(&state);
        let size_after_first = solver.tt_size();
        solver.solve(&state);
        assert_eq!(solver.tt_size(), size_after_first);
    }

    #[test]
    fn cross_turn_predictions_consistent() {
        reset_card_ids();
        let p: Vec<Card> = (0..5).map(|_| create_card(10,10,10,10,CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|_| create_card(1,1,1,1,CardType::None)).collect();
        let opening = create_initial_state(p, o, Owner::Player, no_rules());
        let mut solver = Solver::new();
        solver.reset();

        let opening_moves = solver.solve(&opening);
        let opening_outcome = opening_moves[0].outcome;

        let state_after_1 = place_card(&opening, opening_moves[0].card, opening_moves[0].position as usize);
        let moves_after_1 = solver.solve(&state_after_1);
        let outcome_after_1 = moves_after_1[0].outcome;

        let mirror = |o: Outcome| match o {
            Outcome::Win  => Outcome::Loss,
            Outcome::Loss => Outcome::Win,
            Outcome::Draw => Outcome::Draw,
        };
        assert_eq!(outcome_after_1, mirror(opening_outcome));
    }

    // ---- TT hash collision regression ----

    #[test]
    fn distinct_hashes_for_same_stats_different_ids() {
        reset_card_ids();
        let p_strong = create_card(8,8,8,8,CardType::None);
        let o_strong = create_card(8,8,8,8,CardType::None);
        let weak     = create_card(1,1,1,1,CardType::None);

        let pos_a = GameState {
            board: [
                Some(PlacedCard { card: p_strong, owner: Owner::Player }),
                None, None, None, None, None, None, None, None,
            ],
            player_hand:   vec![weak, weak, weak, weak],
            opponent_hand: vec![o_strong, weak, weak, weak, weak],
            current_turn: Owner::Opponent,
            rules: no_rules(),
        };

        let pos_b = GameState {
            board: [
                Some(PlacedCard { card: o_strong, owner: Owner::Player }),
                None, None, None, None, None, None, None, None,
            ],
            player_hand:   vec![p_strong, weak, weak, weak, weak],
            opponent_hand: vec![weak, weak, weak, weak],
            current_turn: Owner::Opponent,
            rules: no_rules(),
        };

        let solver = Solver::new();
        assert_ne!(solver.hash_for(&pos_a), solver.hash_for(&pos_b));
    }

    #[test]
    fn flat_tt_lookup_hit_and_miss() {
        // Directly test TTSlot lookup semantics
        let mut tt = vec![TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact }; 8]; // size=8, mask=7
        let mask: u64 = 7;
        let key: u64 = 42;
        let idx = (key & mask) as usize; // = 42 & 7 = 2

        // Initially: miss
        assert_eq!(tt[idx].key, EMPTY_KEY);

        // Insert
        tt[idx] = TTSlot { key, value: 1, flag: TTFlag::Exact };

        // Hit
        assert_eq!(tt[idx].key, key);
        assert_eq!(tt[idx].value, 1);

        // Different key at same index: collision = miss
        let key2: u64 = 42 + 8; // same index (50 & 7 = 2), different key
        assert_ne!(tt[idx].key, key2);
    }

    #[test]
    fn flat_tt_solver_correctness_unchanged() {
        // After switching to flat-array TT, solver must still return same results as before.
        // Verify with the known "late game win" scenario.
        reset_card_ids();
        let p = vec![
            create_card(10,10,10,10,CardType::None), create_card(1,1,1,1,CardType::None),
            create_card(2,2,2,2,CardType::None),     create_card(3,3,3,3,CardType::None),
            create_card(4,4,4,4,CardType::None),
        ];
        let o = vec![
            create_card(1,1,1,1,CardType::None), create_card(5,5,5,5,CardType::None),
            create_card(6,6,6,6,CardType::None), create_card(7,7,7,7,CardType::None),
            create_card(8,8,8,8,CardType::None),
        ];
        use crate::board::place_card;
        let mut state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
        state = place_card(&state, p[1], 0);
        state = place_card(&state, o[0], 1);
        state = place_card(&state, p[2], 2);
        state = place_card(&state, o[1], 3);
        state = place_card(&state, p[3], 5);
        state = place_card(&state, o[2], 6);
        state = place_card(&state, p[4], 7);
        state = place_card(&state, o[3], 8);
        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0].position, 4);
        assert_eq!(moves[0].card.id, p[0].id);
        assert_eq!(moves[0].outcome, Outcome::Win);
    }

    #[test]
    fn benchmark_flat_array_tt() {
        reset_card_ids();
        let p = vec![
            create_card(10,5,3,8,CardType::None), create_card(7,6,4,9,CardType::None),
            create_card(2,8,6,3,CardType::None),  create_card(5,4,7,1,CardType::None),
            create_card(9,3,2,6,CardType::None),
        ];
        let o = vec![
            create_card(4,7,5,2,CardType::None),  create_card(8,3,9,6,CardType::None),
            create_card(1,5,8,4,CardType::None),  create_card(6,9,1,7,CardType::None),
            create_card(3,2,4,10,CardType::None),
        ];
        let state = create_initial_state(p, o, Owner::Player, no_rules());

        let t0 = std::time::Instant::now();
        let moves = find_best_move(&state);
        let elapsed_us = t0.elapsed().as_micros();

        assert!(!moves.is_empty());
        println!("Flat-array TT solve: {elapsed_us}µs ({} moves)", moves.len());
    }

    #[test]
    fn benchmark_mutation_speedup() {
        reset_card_ids();
        let p = vec![
            create_card(10,5,3,8,CardType::None), create_card(7,6,4,9,CardType::None),
            create_card(2,8,6,3,CardType::None),  create_card(5,4,7,1,CardType::None),
            create_card(9,3,2,6,CardType::None),
        ];
        let o = vec![
            create_card(4,7,5,2,CardType::None),  create_card(8,3,9,6,CardType::None),
            create_card(1,5,8,4,CardType::None),  create_card(6,9,1,7,CardType::None),
            create_card(3,2,4,10,CardType::None),
        ];
        let state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());

        let t0 = std::time::Instant::now();
        let moves = find_best_move(&state);
        let elapsed_us = t0.elapsed().as_micros();

        assert!(!moves.is_empty(), "Solver returned no moves");
        println!("Step 5 in-place mutation: solve took {elapsed_us}µs ({} moves)", moves.len());
        // No upper-bound assertion — this is a recording checkpoint, not a speed gate
    }
}
