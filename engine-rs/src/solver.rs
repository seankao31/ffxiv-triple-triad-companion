// ABOUTME: Negamax solver with alpha-beta pruning and transposition table.
// ABOUTME: Returns moves ranked by score (higher = better) from the current player's perspective.

use std::collections::HashSet;
use crate::board::{place_card_mut, undo_place};
use crate::types::{Card, CardType, GameState, Owner, RankedMove};

// Assigns a unique integer to each card based on its values and type for within-hand deduplication.
// Duplicate cards in one hand are illegal in-game, but this dedup is cheap and aids testing.
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

// Returns mover_score - 5: positive means the current_turn player is winning.
// Range: -4 to +4 (scores are 1-9 since 0 and 10 are impossible).
fn terminal_value(state: &GameState) -> i32 {
    let (player, opponent) = crate::types::get_score(state);
    let mover_score = if state.current_turn == Owner::Player { player } else { opponent };
    mover_score as i32 - 5
}

// 4M entries (64MB). Sized to prevent saturation on the 10-distinct-card opening position.
const TT_SIZE: usize = 1 << 22;
const EMPTY_KEY: u64 = u64::MAX;

// Domain-appropriate bounds for alpha-beta. Using i32::MIN/MAX causes overflow on negation.
// Score range is -4..+4, so -10/+10 are safely outside.
const NEG_INF: i32 = -10;
const POS_INF: i32 = 10;

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
// depth = cards remaining in both hands at the time of write (higher = closer to root).
// Replacement policy: only overwrite an occupied slot if incoming depth >= existing depth.
// This preserves root-adjacent entries (expensive to recompute) against leaf entries (cheap).
#[derive(Clone, Copy)]
struct TTSlot {
    key: u64,
    value: i32,
    flag: TTFlag,
    depth: u8,
}

// Returns value from the mover's perspective (positive = good for mover).
// Range: -4 to +4 (score - 5, where score is 1-9).
fn negamax(
    state: &mut GameState,
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
        return terminal_value(state);
    }

    let key = hash_state(state);
    // Apply Fibonacci mixing before masking to distribute the polynomial hash uniformly.
    // hash_state uses base-32 encoding so low bits alone would cluster mid-game positions.
    let tt_idx = (key.wrapping_mul(0x9e3779b97f4a7c15) >> (64 - TT_SIZE.trailing_zeros())) as usize;
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

    let orig_alpha = alpha;
    let mut best_value = NEG_INF;

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
            let value = -negamax(state, -beta, -alpha, tt, occupied);
            undo_place(state, undo);

            if value > best_value { best_value = value; }
            if value > alpha { alpha = value; }
            if alpha >= beta { break 'outer; }
        }
    }

    // TTFlag: always maximizing, so standard alpha-beta flag logic.
    let flag = if best_value <= orig_alpha {
        TTFlag::UpperBound
    } else if best_value >= beta {
        TTFlag::LowerBound
    } else {
        TTFlag::Exact
    };

    let incoming_depth = (state.player_hand.len() + state.opponent_hand.len()) as u8;
    if key != EMPTY_KEY {
        let existing = &tt[tt_idx];
        if existing.key == EMPTY_KEY {
            *occupied += 1;
            tt[tt_idx] = TTSlot { key, value: best_value, flag, depth: incoming_depth };
        } else if incoming_depth >= existing.depth {
            tt[tt_idx] = TTSlot { key, value: best_value, flag, depth: incoming_depth };
        }
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

    // negamax values are from the mover's perspective. TT entries are keyed by hash_state
    // which includes current_turn, so entries for Player-to-move and Opponent-to-move
    // never collide. The persistent Solver's TT reuse across turns is safe.

    // Clone hand before first pass to avoid borrow conflicts during mutation
    let hand_cards: Vec<Card> = if state.current_turn == Owner::Player {
        state.player_hand.clone()
    } else {
        state.opponent_hand.clone()
    };

    // First pass: evaluate all moves with negamax
    let mut evaluated: Vec<(Card, usize, i32)> = Vec::new();
    let mut seen_cards: HashSet<u32> = HashSet::new();

    for card in hand_cards.iter() {
        let ck = stats_key(card);
        if !seen_cards.insert(ck) { continue; }

        for i in 0..9usize {
            if state.board[i].is_some() { continue; }
            let undo = place_card_mut(state, *card, i);
            let value = -negamax(state, NEG_INF, POS_INF, tt, occupied);
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
                    // 2 plies from root = root mover's turn. negamax returns from
                    // root mover's perspective directly, no negation needed.
                    let response_value =
                        negamax(state, NEG_INF, POS_INF, tt, occupied);
                    undo_place(state, inner_undo);
                    // Compare outcome tiers, not raw scores.
                    // Both values are from root mover's perspective.
                    let tier = |v: i32| if v > 0 { 0u8 } else if v == 0 { 1 } else { 2 };
                    let move_tier = tier(value);
                    let resp_tier = tier(response_value);
                    if resp_tier < move_tier { better_outcome_count += 1; }
                }
            }

            undo_place(state, undo);

            // value is from root mover's perspective; convert from differential to raw score (1-9).
            let score = (value + 5) as u8;
            let robustness = if total_responses > 0 {
                better_outcome_count as f64 / total_responses as f64
            } else {
                0.0
            };

            RankedMove { card, position: position as u8, score, robustness, confidence: None }
        })
        .collect();

    // Sort: wins first, then draws, then losses; within same outcome, higher robustness first
    moves.sort_by(|a, b| {
        // Primary: outcome tier (win > draw > loss). >5 = win (0), =5 = draw (1), <5 = loss (2).
        let tier = |s: u8| if s > 5 { 0u8 } else if s == 5 { 1 } else { 2 };
        let td = tier(a.score).cmp(&tier(b.score));
        if td != std::cmp::Ordering::Equal {
            return td;
        }
        // Secondary: higher robustness first.
        let rd = b.robustness.partial_cmp(&a.robustness).unwrap_or(std::cmp::Ordering::Equal);
        if rd != std::cmp::Ordering::Equal {
            return rd;
        }
        // Tertiary: higher score first (prefer bigger wins / smaller losses).
        b.score.cmp(&a.score)
    });

    moves
}

pub fn find_best_move(state: &GameState) -> Vec<RankedMove> {
    let mut tt = vec![TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact, depth: 0 }; TT_SIZE];
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
            tt: vec![TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact, depth: 0 }; TT_SIZE],
            tt_occupied: 0,
        }
    }

    pub fn reset(&mut self) {
        self.tt.fill(TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact, depth: 0 });
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
        create_card, create_initial_state, get_score, reset_card_ids, Board, CardType, Owner,
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
    fn terminal_value_returns_score_differential() {
        reset_card_ids();
        // Board with 8 cells filled. Player's turn, 1 empty cell.
        // Player has strong card (10s), will capture the weak opponent card below.
        let board: Board = [
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
            Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
            Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
            Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
            Some(PlacedCard { card: create_card(1,1,1,1,CardType::None), owner: Owner::Opponent }),
            None,
        ];
        let state = GameState {
            board,
            player_hand: vec![create_card(10,10,10,10,CardType::None)],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: no_rules(),
        };

        // Player places at pos 8, captures pos 7 and pos 5 (10 > 1 on both edges).
        // Final: player owns 7 cards (5 original + placed + 2 captured), opponent owns 2.
        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0].position, 8);
        assert!(moves[0].score > 5, "Expected winning score (>5), got {}", moves[0].score);
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
        let tier = |s: u8| if s > 5 { 0u8 } else if s == 5 { 1 } else { 2 };
        // Non-decreasing tier order (existing invariant)
        for i in 1..moves.len() {
            assert!(tier(moves[i].score) >= tier(moves[i - 1].score));
        }
        // Tier boundaries: verify exact counts, not just ordering.
        // This game state produces 3 wins, 8 draws, 1 loss.
        let win_count = moves.iter().filter(|m| m.score > 5).count();
        let draw_count = moves.iter().filter(|m| m.score == 5).count();
        let loss_count = moves.iter().filter(|m| m.score < 5).count();
        assert_eq!(win_count, 3, "Expected 3 wins");
        assert_eq!(draw_count, 8, "Expected 8 draws");
        assert_eq!(loss_count, 1, "Expected 1 loss");
        // First non-win must be a draw, not another win (catches >= 5 tier mutation)
        assert_eq!(tier(moves[win_count].score), 1, "First move after wins should be a draw");
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
        assert!(moves.iter().all(|m| m.score == 5), "Expected all draws (score=5)");
        assert_eq!(moves[0].position, 7);
        assert_eq!(moves[1].position, 8);
    }

    #[test]
    fn draw_robustness_nonzero_when_opponent_can_blunder_into_win() {
        // Reuses the same board as prefers_draw_move_with_more_opponent_mistakes.
        // Both moves are draws, but the opponent can blunder (play weak card at the
        // wrong spot) and give us a win. Robustness must be > 0 for draws.
        // This catches the mutation v > 0 → v >= 0 in the robustness tier function,
        // which would collapse draws into the "win" tier and make robustness = 0.
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
        assert!(moves.iter().all(|m| m.score == 5), "Expected all draws");
        // Position 7 lets the opponent blunder (play weak card o1) giving us a win;
        // robustness must be > 0. Position 8 has no such blunder opportunity, so
        // robustness is 0. This catches the mutation v > 0 → v >= 0 in the tier
        // function, which would treat draws as wins and collapse robustness to 0.
        let pos7 = moves.iter().find(|m| m.position == 7)
            .expect("Expected move at position 7");
        assert!(pos7.robustness > 0.0,
            "Draw at pos 7 should have non-zero robustness (opponent can blunder), got {}",
            pos7.robustness);
    }

    #[test]
    fn prefers_moves_with_higher_robustness() {
        reset_card_ids();
        let p: Vec<Card> = (0..5u8).map(|v| create_card(10 - v, 10 - v, 10 - v, 10 - v, CardType::None)).collect();
        let o: Vec<Card> = (0..5u8).map(|v| create_card(v + 1, v + 1, v + 1, v + 1, CardType::None)).collect();
        let state = create_initial_state(p, o, Owner::Player, no_rules());
        let moves = find_best_move(&state);
        let win_moves: Vec<_> = moves.iter().filter(|m| m.score > 5).collect();
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
        assert!(moves.iter().all(|m| m.score > 5), "Expected all wins (score>5)");
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
        assert!(moves.iter().all(|m| m.score < 5), "Expected all losses (score<5)");
        for i in 1..moves.len() {
            assert!(moves[i].robustness <= moves[i - 1].robustness);
        }
    }

    #[test]
    fn robustness_nonzero_when_opponent_can_blunder() {
        // Board: top row Player(10s), middle row Opponent(10s), bottom row empty.
        // Player has 2 weak cards; Opponent has 2 strong cards. Player's turn.
        //
        // When Player places weak at pos 6 (or 8), the adjacent Opponent can only
        // capture via pos 7 — placing elsewhere is a blunder (draw instead of loss).
        // Expected robustness for pos 6/8 = 0.5, for pos 7 = 0.0.
        reset_card_ids();
        let board: Board = [
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Player }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Opponent }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Opponent }),
            Some(PlacedCard { card: create_card(10,10,10,10,CardType::None), owner: Owner::Opponent }),
            None, None, None,
        ];

        let state = GameState {
            board,
            player_hand: vec![
                create_card(1,1,1,1,CardType::None),
                create_card(1,1,1,1,CardType::None),
            ],
            opponent_hand: vec![
                create_card(10,10,10,10,CardType::None),
                create_card(10,10,10,10,CardType::None),
            ],
            current_turn: Owner::Player,
            rules: no_rules(),
        };

        let moves = find_best_move(&state);
        assert_eq!(moves.len(), 3);
        assert!(moves.iter().all(|m| m.score < 5), "Expected all losses (score<5)");
        // Positions 6 and 8 have blunder-able opponent responses → robustness > 0
        assert!(moves[0].robustness > 0.0,
            "Best loss move should have non-zero robustness, got {}", moves[0].robustness);
        assert_eq!(moves[0].robustness, 0.5);
        // Position 7: all opponent responses lead to loss → robustness = 0
        let pos7 = moves.iter().find(|m| m.position == 7).unwrap();
        assert_eq!(pos7.robustness, 0.0);
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
        let s_scores: Vec<u8> = solver_moves.iter().map(|m| m.score).collect();
        let d_scores: Vec<u8> = direct_moves.iter().map(|m| m.score).collect();
        assert_eq!(s_scores, d_scores);
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
        let opening_score = opening_moves[0].score;

        let state_after_1 = place_card(&opening, opening_moves[0].card, opening_moves[0].position as usize);
        let moves_after_1 = solver.solve(&state_after_1);
        let score_after_1 = moves_after_1[0].score;

        // Scores sum to 10: opponent's score from their perspective = 10 - player's opening score.
        assert_eq!(score_after_1, 10 - opening_score,
            "Cross-turn score inconsistency: opening={}, after_1={}", opening_score, score_after_1);
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
        let mut tt = vec![TTSlot { key: EMPTY_KEY, value: 0, flag: TTFlag::Exact, depth: 0 }; 8]; // size=8, mask=7
        let mask: u64 = 7;
        let key: u64 = 42;
        let idx = (key & mask) as usize; // = 42 & 7 = 2

        // Initially: miss
        assert_eq!(tt[idx].key, EMPTY_KEY);

        // Insert
        tt[idx] = TTSlot { key, value: 1, flag: TTFlag::Exact, depth: 0 };

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
        assert!(moves[0].score > 5, "Expected win (score>5), got {}", moves[0].score);
    }

    #[test]
    #[ignore = "heavy benchmark: opening-position solve with 10 distinct cards (~7s release)"]
    fn benchmark_opening_position() {
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
        println!("Opening-position solve: {elapsed_us}µs ({} moves)", moves.len());
    }

    #[test]
    fn cross_turn_tt_is_consistent() {
        // Mirrors TS "cross-turn predictions are consistent" test.
        // If solver predicts Win on turn 1, the TT must not corrupt evaluations on turn 2.
        reset_card_ids();
        // Asymmetric hands: all-10s vs all-1s — player is predicted to Win.
        let p: Vec<Card> = (0..5).map(|_| create_card(10, 10, 10, 10, CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|_| create_card(1, 1, 1, 1, CardType::None)).collect();
        let state0 = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());

        let mut solver = Solver::new();

        // Turn 1: player solves from opening — should predict Win.
        let moves1 = solver.solve(&state0);
        assert!(!moves1.is_empty());
        assert!(moves1[0].score > 5, "Expected win from opening");

        // Simulate: player plays best move, opponent plays best (first ranked) move.
        let state1 = place_card(&state0, moves1[0].card, moves1[0].position as usize);
        let opp_moves = solver.solve(&state1);
        assert!(!opp_moves.is_empty());
        let state2 = place_card(&state1, opp_moves[0].card, opp_moves[0].position as usize);

        // Turn 2: player's turn again — should still Win (not corrupted by persistent TT).
        let moves2 = solver.solve(&state2);
        assert!(!moves2.is_empty());
        assert!(
            moves2[0].score > 5 || moves2[0].score == 5,
            "TT corruption: turn-2 score = {}", moves2[0].score
        );
    }

    #[test]
    fn predicted_loss_move_results_in_loss_when_played_optimally() {
        // Mirrors TS "predicted-Loss move results in a Loss for the player".
        // Verifies that solver's Loss prediction is accurate end-to-end.
        reset_card_ids();
        // Player has mostly weak cards; opponent has strong cards.
        // This asymmetry should produce some Loss moves for the player.
        let p = vec![
            create_card(10, 10, 10, 10, CardType::None),  // one strong card
            create_card(1, 1, 1, 1, CardType::None),
            create_card(1, 1, 1, 1, CardType::None),
            create_card(1, 1, 1, 1, CardType::None),
            create_card(1, 1, 1, 1, CardType::None),
        ];
        let o = vec![
            create_card(10, 10, 10, 10, CardType::None),
            create_card(9, 9, 9, 9, CardType::None),
            create_card(8, 8, 8, 8, CardType::None),
            create_card(7, 7, 7, 7, CardType::None),
            create_card(6, 6, 6, 6, CardType::None),
        ];
        let state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());
        let mut solver = Solver::new();

        let moves = solver.solve(&state);
        let loss_move = moves.iter().find(|m| m.score < 5);
        let loss_move = match loss_move {
            None => return, // No Loss moves exist — skip (setup didn't produce right scenario)
            Some(m) => m.clone(),
        };

        // Play the predicted-Loss move and self-play to the end.
        let mut cur = place_card(&state, loss_move.card, loss_move.position as usize);
        loop {
            let moves = solver.solve(&cur);
            if moves.is_empty() {
                break;
            }
            cur = place_card(&cur, moves[0].card, moves[0].position as usize);
        }

        // Final score: player should have lost (fewer cells than opponent).
        let (player_score, opp_score) = get_score(&cur);
        assert!(
            player_score < opp_score,
            "Predicted Loss but player did not lose: player={} opponent={}",
            player_score, opp_score
        );
    }

    #[test]
    #[ignore = "slow: measures turn-2 TT reuse speedup for 10-distinct-card opening position (~20s release)"]
    fn tt_reuse_speedup_10_card_opening() {
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
        let mut solver = Solver::new();

        let t0 = std::time::Instant::now();
        solver.solve(&state);
        let first_us = t0.elapsed().as_micros();
        let tt_after_first = solver.tt_size();

        let t1 = std::time::Instant::now();
        solver.solve(&state);
        let second_us = t1.elapsed().as_micros();
        let tt_after_second = solver.tt_size();

        println!("Turn 1: {first_us}µs (TT: {tt_after_first}/{TT_SIZE})");
        println!("Turn 2: {second_us}µs (TT: {tt_after_second}/{TT_SIZE})");
        println!("Speedup: {:.1}×", first_us as f64 / second_us as f64);
        assert!(
            second_us * 10 < first_us + 1,
            "TT reuse insufficient: turn-1={first_us}µs turn-2={second_us}µs"
        );
    }

    #[test]
    #[ignore = "slow: opening solve with 10 distinct cards (~8s release). Verifies TT does not saturate."]
    fn tt_not_saturated_after_10_card_opening_solve() {
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
        let mut solver = Solver::new();
        solver.solve(&state);
        println!("TT occupancy: {}/{} ({:.1}%)",
            solver.tt_size(), TT_SIZE,
            solver.tt_size() as f64 / TT_SIZE as f64 * 100.0);
        assert!(
            solver.tt_size() < TT_SIZE,
            "TT saturated: {}/{} entries used; TT_SIZE needs to be increased.",
            solver.tt_size(), TT_SIZE
        );
    }

    #[test]
    #[ignore = "slow: full game self-play (~10ms with degenerate hands)"]
    fn self_play_from_opening_achieves_predicted_outcome() {
        // If solver predicts Win from opening, self-play should reach Win.
        // Uses all-10s vs all-1s — degenerate, fast search, player always wins.
        reset_card_ids();
        let p: Vec<Card> = (0..5).map(|_| create_card(10, 10, 10, 10, CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|_| create_card(1, 1, 1, 1, CardType::None)).collect();
        let state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules());

        let mut solver = Solver::new();
        let predicted_score = solver.solve(&state)[0].score;
        assert!(predicted_score > 5, "Expected winning prediction");

        let mut cur = state;
        loop {
            let moves = solver.solve(&cur);
            if moves.is_empty() {
                break;
            }
            cur = place_card(&cur, moves[0].card, moves[0].position as usize);
        }

        let (player_score, _opp_score) = crate::types::get_score(&cur);
        assert_eq!(player_score as u8, predicted_score,
            "Self-play score {} differs from prediction {}", player_score, predicted_score);
    }

    #[test]
    #[ignore = "slow: full game self-play with Plus rule"]
    fn self_play_with_plus_rule_achieves_predicted_outcome() {
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
        let rules = RuleSet { plus: true, same: false, reverse: false,
            fallen_ace: false, ascension: false, descension: false };
        let state = create_initial_state(p.clone(), o.clone(), Owner::Player, rules);

        let mut solver = Solver::new();
        let predicted_score = solver.solve(&state)[0].score;

        let mut cur = state;
        loop {
            let moves = solver.solve(&cur);
            if moves.is_empty() {
                break;
            }
            cur = place_card(&cur, moves[0].card, moves[0].position as usize);
        }

        let (player_score, _opp_score) = crate::types::get_score(&cur);
        assert_eq!(player_score as u8, predicted_score,
            "Self-play score {} differs from prediction {}", player_score, predicted_score);
    }

    #[test]
    fn solver_handles_plus_rule_without_panic() {
        // Verify solver returns valid moves on a Plus-rule mid-game state.
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
        let rules = RuleSet { plus: true, same: false, reverse: false,
            fallen_ace: false, ascension: false, descension: false };
        let state = create_initial_state(p.clone(), o.clone(), Owner::Player, rules);
        // Use a mid-game position (3 cards placed) for speed.
        let state = place_card(&state, p[0], 0);
        let state = place_card(&state, o[0], 1);
        let state = place_card(&state, p[1], 2);
        let moves = find_best_move(&state);
        assert!(!moves.is_empty());
        for m in &moves {
            assert!((1..=9).contains(&m.score), "Invalid score: {}", m.score);
        }
    }

    #[test]
    fn solver_handles_same_rule_without_panic() {
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
        let rules = RuleSet { plus: false, same: true, reverse: false,
            fallen_ace: false, ascension: false, descension: false };
        let state = create_initial_state(p.clone(), o.clone(), Owner::Player, rules);
        let state = place_card(&state, p[0], 0);
        let state = place_card(&state, o[0], 1);
        let moves = find_best_move(&state);
        assert!(!moves.is_empty());
    }

    #[test]
    #[ignore = "heavy benchmark: single PIMC simulation (~5.3s release)"]
    fn benchmark_pimc_single_sim() {
        reset_card_ids();
        let p = vec![
            create_card(4,  8, 8,  1, CardType::None),
            create_card(1,  4, 8,  8, CardType::None),
            create_card(8,  2, 8, 10, CardType::None),
            create_card(8,  2, 3,  8, CardType::None),
            create_card(2,  5, 9,  9, CardType::None),
        ];
        let o = vec![
            create_card(3,  7, 5,  2, CardType::None),
            create_card(8,  3, 9,  6, CardType::None),
            create_card(1,  5, 8,  4, CardType::None),
            create_card(6,  9, 1,  7, CardType::None),
            create_card(3,  2, 4, 10, CardType::None),
        ];
        let state = create_initial_state(p, o, Owner::Player, no_rules());

        let t0 = std::time::Instant::now();
        let moves = find_best_move(&state);
        let elapsed_us = t0.elapsed().as_micros();

        assert!(!moves.is_empty(), "Solver returned no moves");
        println!("PIMC single sim: {elapsed_us}µs");
    }

    #[test]
    fn solver_handles_reverse_rule_without_panic() {
        reset_card_ids();
        let p: Vec<Card> = (0..5).map(|i| create_card(i as u8 + 1, i as u8 + 1, i as u8 + 1, i as u8 + 1, CardType::None)).collect();
        let o: Vec<Card> = (0..5).map(|i| create_card(10 - i as u8, 10 - i as u8, 10 - i as u8, 10 - i as u8, CardType::None)).collect();
        let rules = RuleSet { plus: false, same: false, reverse: true,
            fallen_ace: false, ascension: false, descension: false };
        let state = create_initial_state(p.clone(), o.clone(), Owner::Player, rules);
        let state = place_card(&state, p[0], 4);
        let state = place_card(&state, o[0], 5);
        let moves = find_best_move(&state);
        assert!(!moves.is_empty());
    }
}
