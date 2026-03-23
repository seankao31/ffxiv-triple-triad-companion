// ABOUTME: Game logic for card placement and capture resolution.
// ABOUTME: Handles standard capture, Plus, Same, Combo cascades, Reverse, Fallen Ace, Ascension, and Descension rules.

use std::collections::{HashMap, HashSet, VecDeque};

use crate::types::{Board, Card, CardType, Edge, GameState, Owner, PlacedCard, RuleSet, ADJACENCY};

pub(crate) fn card_edge_value(card: &Card, edge: Edge) -> u8 {
    match edge {
        Edge::Top => card.top,
        Edge::Right => card.right,
        Edge::Bottom => card.bottom,
        Edge::Left => card.left,
    }
}

// Applies Ascension/Descension stat modifiers to an edge value.
// Ascension: boosts a card's edge values by the count of same-type cards already on board (capped at 10).
// Descension: reduces a card's edge values by the count of same-type cards already on board (floored at 1).
// type_counts is snapshotted before placement so the placed card never counts toward its own modifier.
fn apply_stat_mod(value: u8, card_type: CardType, rules: RuleSet, type_counts: &HashMap<CardType, u8>) -> u8 {
    let count = *type_counts.get(&card_type).unwrap_or(&0);
    if rules.ascension {
        return value.saturating_add(count).min(10);
    }
    if rules.descension {
        return value.saturating_sub(count).max(1);
    }
    value
}

// Returns true if the attacker's edge value captures the defender's edge value under the active rules.
// Fallen Ace makes the "weakest" value also capture the "strongest":
//   Without Reverse: 1 (weakest) also captures 10; 10 still captures 1 via basic rule.
//   With Reverse:    10 (weakest) also captures 1; 1 still captures 10 via Reverse rule.
fn captures(attack_val: u8, defend_val: u8, rules: RuleSet) -> bool {
    if rules.fallen_ace {
        if !rules.reverse && attack_val == 1 && defend_val == 10 {
            return true;
        }
        if rules.reverse && attack_val == 10 && defend_val == 1 {
            return true;
        }
    }
    if rules.reverse {
        attack_val < defend_val
    } else {
        attack_val > defend_val
    }
}

// Returns positions of opponent cards flipped by the Plus rule.
// Plus triggers when 2+ adjacent pairs share the same sum of touching values.
fn resolve_plus(
    board: &mut Board,
    card: &Card,
    position: usize,
    current_turn: Owner,
    rules: RuleSet,
    type_counts: &HashMap<CardType, u8>,
) -> Vec<usize> {
    let mut sum_groups: HashMap<u8, Vec<usize>> = HashMap::new();

    for neighbor in ADJACENCY[position] {
        let neighbor_pos = neighbor.position as usize;
        if let Some(neighbor_cell) = board[neighbor_pos] {
            let attack_val = apply_stat_mod(
                card_edge_value(card, neighbor.attacking_edge),
                card.card_type,
                rules,
                type_counts,
            );
            let defend_val = apply_stat_mod(
                card_edge_value(&neighbor_cell.card, neighbor.defending_edge),
                neighbor_cell.card.card_type,
                rules,
                type_counts,
            );
            let sum = attack_val + defend_val;
            sum_groups.entry(sum).or_default().push(neighbor_pos);
        }
    }

    let mut flipped = Vec::new();
    for positions in sum_groups.values() {
        if positions.len() < 2 {
            continue;
        }
        for &pos in positions {
            let neighbor_cell = board[pos].unwrap();
            if neighbor_cell.owner != current_turn {
                board[pos] = Some(PlacedCard { card: neighbor_cell.card, owner: current_turn });
                flipped.push(pos);
            }
        }
    }
    flipped
}

// Returns positions of opponent cards flipped by the Same rule.
// Same triggers when 2+ adjacent pairs have equal touching values.
fn resolve_same(
    board: &mut Board,
    card: &Card,
    position: usize,
    current_turn: Owner,
    rules: RuleSet,
    type_counts: &HashMap<CardType, u8>,
) -> Vec<usize> {
    let mut same_pairs: Vec<usize> = Vec::new();

    for neighbor in ADJACENCY[position] {
        let neighbor_pos = neighbor.position as usize;
        if let Some(neighbor_cell) = board[neighbor_pos] {
            let attack_val = apply_stat_mod(
                card_edge_value(card, neighbor.attacking_edge),
                card.card_type,
                rules,
                type_counts,
            );
            let defend_val = apply_stat_mod(
                card_edge_value(&neighbor_cell.card, neighbor.defending_edge),
                neighbor_cell.card.card_type,
                rules,
                type_counts,
            );
            if attack_val == defend_val {
                same_pairs.push(neighbor_pos);
            }
        }
    }

    if same_pairs.len() < 2 {
        return Vec::new();
    }

    let mut flipped = Vec::new();
    for pos in same_pairs {
        let neighbor_cell = board[pos].unwrap();
        if neighbor_cell.owner != current_turn {
            board[pos] = Some(PlacedCard { card: neighbor_cell.card, owner: current_turn });
            flipped.push(pos);
        }
    }
    flipped
}

// BFS over positions flipped by Plus/Same, doing standard captures from each.
// Newly flipped cards are added to the queue. Does NOT re-trigger Plus or Same.
fn resolve_combo(
    board: &mut Board,
    current_turn: Owner,
    initial_flips: Vec<usize>,
    rules: RuleSet,
    type_counts: &HashMap<CardType, u8>,
) {
    let mut queue: VecDeque<usize> = initial_flips.into_iter().collect();
    let mut processed: HashSet<usize> = HashSet::new();

    while let Some(pos) = queue.pop_front() {
        if processed.contains(&pos) {
            continue;
        }
        processed.insert(pos);

        let cell = board[pos].unwrap();
        for neighbor in ADJACENCY[pos] {
            let neighbor_pos = neighbor.position as usize;
            if let Some(neighbor_cell) = board[neighbor_pos] {
                if neighbor_cell.owner != current_turn {
                    let attack_val = apply_stat_mod(
                        card_edge_value(&cell.card, neighbor.attacking_edge),
                        cell.card.card_type,
                        rules,
                        type_counts,
                    );
                    let defend_val = apply_stat_mod(
                        card_edge_value(&neighbor_cell.card, neighbor.defending_edge),
                        neighbor_cell.card.card_type,
                        rules,
                        type_counts,
                    );
                    if captures(attack_val, defend_val, rules) {
                        board[neighbor_pos] =
                            Some(PlacedCard { card: neighbor_cell.card, owner: current_turn });
                        queue.push_back(neighbor_pos);
                    }
                }
            }
        }
    }
}

pub fn place_card(state: &GameState, card: Card, position: usize) -> GameState {
    assert!(position <= 8, "Invalid position: {}", position);
    assert!(state.board[position].is_none(), "Cell {} is already occupied", position);

    let hand = match state.current_turn {
        Owner::Player => &state.player_hand,
        Owner::Opponent => &state.opponent_hand,
    };

    let card_index = hand
        .iter()
        .position(|c| c.id == card.id)
        .expect("Card is not in the current player's hand");

    // Snapshot per-type card counts from board BEFORE placing (placed card excluded).
    let mut type_counts: HashMap<CardType, u8> = HashMap::new();
    for placed in state.board.iter().flatten() {
        *type_counts.entry(placed.card.card_type).or_insert(0) += 1;
    }

    let mut new_board = state.board;
    new_board[position] = Some(PlacedCard { card, owner: state.current_turn });

    // Plus rule
    let plus_flips = if state.rules.plus {
        resolve_plus(&mut new_board, &card, position, state.current_turn, state.rules, &type_counts)
    } else {
        Vec::new()
    };

    // Same rule
    let same_flips = if state.rules.same {
        resolve_same(&mut new_board, &card, position, state.current_turn, state.rules, &type_counts)
    } else {
        Vec::new()
    };

    // Combo cascade
    let combo_seeds: Vec<usize> = plus_flips.into_iter().chain(same_flips).collect();
    resolve_combo(&mut new_board, state.current_turn, combo_seeds, state.rules, &type_counts);

    // Standard capture: flip adjacent opponent cards based on active capture rules
    for neighbor in ADJACENCY[position] {
        let neighbor_pos = neighbor.position as usize;
        if let Some(neighbor_cell) = new_board[neighbor_pos] {
            if neighbor_cell.owner != state.current_turn {
                let attack_val = apply_stat_mod(
                    card_edge_value(&card, neighbor.attacking_edge),
                    card.card_type,
                    state.rules,
                    &type_counts,
                );
                let defend_val = apply_stat_mod(
                    card_edge_value(&neighbor_cell.card, neighbor.defending_edge),
                    neighbor_cell.card.card_type,
                    state.rules,
                    &type_counts,
                );
                if captures(attack_val, defend_val, state.rules) {
                    new_board[neighbor_pos] =
                        Some(PlacedCard { card: neighbor_cell.card, owner: state.current_turn });
                }
            }
        }
    }

    let new_hand: Vec<Card> = hand
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != card_index)
        .map(|(_, c)| *c)
        .collect();

    let next_turn = match state.current_turn {
        Owner::Player => Owner::Opponent,
        Owner::Opponent => Owner::Player,
    };

    let (player_hand, opponent_hand) = match state.current_turn {
        Owner::Player => (new_hand, state.opponent_hand.clone()),
        Owner::Opponent => (state.player_hand.clone(), new_hand),
    };

    GameState {
        board: new_board,
        player_hand,
        opponent_hand,
        current_turn: next_turn,
        rules: state.rules,
    }
}

// Records all state changes made by place_card_mut so they can be reversed.
pub struct UndoRecord {
    card: Card,
    position: usize,
    card_hand_index: usize,
    prev_turn: Owner,
    flipped: Vec<(usize, Owner)>,
}

// BFS combo cascade that records every ownership change, for use with undo.
fn resolve_combo_tracked(
    board: &mut Board,
    current_turn: Owner,
    initial_flips: Vec<usize>,
    rules: RuleSet,
    type_counts: &HashMap<CardType, u8>,
) -> Vec<(usize, Owner)> {
    let mut queue: VecDeque<usize> = initial_flips.into_iter().collect();
    let mut processed: HashSet<usize> = HashSet::new();
    let mut all_flipped: Vec<(usize, Owner)> = Vec::new();

    while let Some(pos) = queue.pop_front() {
        if processed.contains(&pos) {
            continue;
        }
        processed.insert(pos);

        let cell = board[pos].unwrap();
        for neighbor in ADJACENCY[pos] {
            let neighbor_pos = neighbor.position as usize;
            if let Some(neighbor_cell) = board[neighbor_pos] {
                if neighbor_cell.owner != current_turn {
                    let attack_val = apply_stat_mod(
                        card_edge_value(&cell.card, neighbor.attacking_edge),
                        cell.card.card_type,
                        rules,
                        type_counts,
                    );
                    let defend_val = apply_stat_mod(
                        card_edge_value(&neighbor_cell.card, neighbor.defending_edge),
                        neighbor_cell.card.card_type,
                        rules,
                        type_counts,
                    );
                    if captures(attack_val, defend_val, rules) {
                        all_flipped.push((neighbor_pos, neighbor_cell.owner));
                        board[neighbor_pos] =
                            Some(PlacedCard { card: neighbor_cell.card, owner: current_turn });
                        queue.push_back(neighbor_pos);
                    }
                }
            }
        }
    }

    all_flipped
}

/// Places a card in-place and returns an UndoRecord. Mirrors place_card exactly.
pub fn place_card_mut(state: &mut GameState, card: Card, position: usize) -> UndoRecord {
    assert!(position <= 8, "Invalid position: {}", position);
    assert!(state.board[position].is_none(), "Cell {} is already occupied", position);

    let hand = match state.current_turn {
        Owner::Player => &state.player_hand,
        Owner::Opponent => &state.opponent_hand,
    };

    let card_hand_index = hand
        .iter()
        .position(|c| c.id == card.id)
        .expect("Card is not in the current player's hand");

    // Snapshot per-type card counts from board BEFORE placing (placed card excluded).
    let mut type_counts: HashMap<CardType, u8> = HashMap::new();
    for placed in state.board.iter().flatten() {
        *type_counts.entry(placed.card.card_type).or_insert(0) += 1;
    }

    let prev_turn = state.current_turn;
    let mut flipped: Vec<(usize, Owner)> = Vec::new();

    state.board[position] = Some(PlacedCard { card, owner: state.current_turn });

    // Plus rule
    let plus_flips = if state.rules.plus {
        let positions = resolve_plus(&mut state.board, &card, position, state.current_turn, state.rules, &type_counts);
        for &pos in &positions {
            // resolve_plus already flipped owner to current_turn; record the old owner (opponent)
            let old_owner = match state.current_turn {
                Owner::Player => Owner::Opponent,
                Owner::Opponent => Owner::Player,
            };
            flipped.push((pos, old_owner));
        }
        positions
    } else {
        Vec::new()
    };

    // Same rule
    let same_flips = if state.rules.same {
        let positions = resolve_same(&mut state.board, &card, position, state.current_turn, state.rules, &type_counts);
        for &pos in &positions {
            let old_owner = match state.current_turn {
                Owner::Player => Owner::Opponent,
                Owner::Opponent => Owner::Player,
            };
            flipped.push((pos, old_owner));
        }
        positions
    } else {
        Vec::new()
    };

    // Combo cascade — track all ownership changes
    let combo_seeds: Vec<usize> = plus_flips.into_iter().chain(same_flips).collect();
    let combo_flips = resolve_combo_tracked(&mut state.board, state.current_turn, combo_seeds, state.rules, &type_counts);
    flipped.extend(combo_flips);

    // Standard capture: flip adjacent opponent cards based on active capture rules
    for neighbor in ADJACENCY[position] {
        let neighbor_pos = neighbor.position as usize;
        if let Some(neighbor_cell) = state.board[neighbor_pos] {
            if neighbor_cell.owner != state.current_turn {
                let attack_val = apply_stat_mod(
                    card_edge_value(&card, neighbor.attacking_edge),
                    card.card_type,
                    state.rules,
                    &type_counts,
                );
                let defend_val = apply_stat_mod(
                    card_edge_value(&neighbor_cell.card, neighbor.defending_edge),
                    neighbor_cell.card.card_type,
                    state.rules,
                    &type_counts,
                );
                if captures(attack_val, defend_val, state.rules) {
                    flipped.push((neighbor_pos, neighbor_cell.owner));
                    state.board[neighbor_pos] =
                        Some(PlacedCard { card: neighbor_cell.card, owner: state.current_turn });
                }
            }
        }
    }

    // Remove card from hand
    match state.current_turn {
        Owner::Player => state.player_hand.remove(card_hand_index),
        Owner::Opponent => state.opponent_hand.remove(card_hand_index),
    };

    // Flip turn
    state.current_turn = match state.current_turn {
        Owner::Player => Owner::Opponent,
        Owner::Opponent => Owner::Player,
    };

    UndoRecord { card, position, card_hand_index, prev_turn, flipped }
}

/// Reverts all changes made by place_card_mut using the provided UndoRecord.
pub fn undo_place(state: &mut GameState, undo: UndoRecord) {
    // Restore turn
    state.current_turn = undo.prev_turn;

    // Remove the placed card from the board
    state.board[undo.position] = None;

    // Restore ownership of all flipped cards in reverse order
    for &(pos, old_owner) in undo.flipped.iter().rev() {
        state.board[pos].as_mut().unwrap().owner = old_owner;
    }

    // Reinsert card back into the hand
    match undo.prev_turn {
        Owner::Player => state.player_hand.insert(undo.card_hand_index, undo.card),
        Owner::Opponent => state.opponent_hand.insert(undo.card_hand_index, undo.card),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CardType, Owner, PlacedCard, RuleSet, create_card, create_initial_state, get_score, reset_card_ids};

    // ── helpers ──────────────────────────────────────────────────────────────

    fn no_rules() -> RuleSet {
        RuleSet::default()
    }

    fn same_rules() -> RuleSet {
        RuleSet { same: true, ..RuleSet::default() }
    }

    fn plus_rules() -> RuleSet {
        RuleSet { plus: true, ..RuleSet::default() }
    }

    // ── placement validation and standard capture ────────────────────────────

    #[test]
    fn test_place_card_on_empty_cell() {
        reset_card_ids();
        let card1 = create_card(1, 2, 3, 4, CardType::None);
        let card2 = create_card(5, 6, 7, 8, CardType::None);
        let op1 = create_card(9, 8, 7, 6, CardType::None);
        let op2 = create_card(3, 4, 5, 6, CardType::None);

        let state = create_initial_state(vec![card1, card2], vec![op1, op2], Owner::Player, RuleSet::default());
        let result = place_card(&state, card1, 0);

        assert_eq!(result.board[0], Some(PlacedCard { card: card1, owner: Owner::Player }));
        assert_eq!(result.player_hand, vec![card2]);
        assert_eq!(result.current_turn, Owner::Opponent);
    }

    #[test]
    #[should_panic]
    fn test_place_card_occupied_panics() {
        reset_card_ids();
        let card1 = create_card(1, 2, 3, 4, CardType::None);
        let card2 = create_card(5, 6, 7, 8, CardType::None);
        let op1 = create_card(9, 8, 7, 6, CardType::None);
        let op2 = create_card(3, 4, 5, 6, CardType::None);

        let state = create_initial_state(vec![card1, card2], vec![op1, op2], Owner::Player, RuleSet::default());
        let after_first = place_card(&state, card1, 4);
        place_card(&after_first, op1, 4); // position 4 already occupied
    }

    #[test]
    #[should_panic]
    fn test_place_card_not_in_hand_panics() {
        reset_card_ids();
        let card1 = create_card(1, 2, 3, 4, CardType::None);
        let card2 = create_card(5, 6, 7, 8, CardType::None);
        let card3 = create_card(2, 3, 4, 5, CardType::None);
        let op1 = create_card(9, 8, 7, 6, CardType::None);
        let op2 = create_card(3, 4, 5, 6, CardType::None);

        let state = create_initial_state(vec![card1, card2], vec![op1, op2], Owner::Player, RuleSet::default());
        place_card(&state, card3, 0); // card3 not in player's hand
    }

    #[test]
    #[should_panic]
    fn test_place_card_out_of_range_panics() {
        reset_card_ids();
        let card1 = create_card(1, 2, 3, 4, CardType::None);
        let op1 = create_card(9, 8, 7, 6, CardType::None);

        let state = create_initial_state(vec![card1], vec![op1], Owner::Player, RuleSet::default());
        place_card(&state, card1, 9); // 9 is out of range
    }

    #[test]
    fn test_standard_capture_higher_wins() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let op_card = create_card(1, 3, 1, 1, CardType::None); // right=3
        let p_card = create_card(1, 1, 1, 5, CardType::None);  // left=5 attacks op's right

        let state = create_initial_state(
            vec![filler, p_card, filler, filler, filler],
            vec![op_card, filler, filler, filler, filler],
            Owner::Player,
            RuleSet::default(),
        );

        // Turn 1: Player at pos 8 (non-adjacent to 0 or 1)
        let s = place_card(&state, filler, 8);
        // Turn 2: Opponent places op_card at pos 0
        let s = place_card(&s, op_card, 0);
        // Turn 3: Player places p_card at pos 1 (left=5 beats op's right=3)
        let s = place_card(&s, p_card, 1);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
        assert_eq!(s.board[0].unwrap().card, op_card);
    }

    #[test]
    fn test_standard_capture_equal_no_capture() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let op_card = create_card(1, 5, 1, 1, CardType::None); // right=5
        let p_card = create_card(1, 1, 1, 5, CardType::None);  // left=5 (equal, should not capture)

        let state = create_initial_state(
            vec![filler, p_card, filler, filler, filler],
            vec![op_card, filler, filler, filler, filler],
            Owner::Player,
            RuleSet::default(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op_card, 0);
        let s = place_card(&s, p_card, 1);

        assert_eq!(s.board[0].unwrap().owner, Owner::Opponent);
    }

    #[test]
    fn test_standard_capture_own_cards_unaffected() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let p_card1 = create_card(1, 1, 1, 1, CardType::None);
        let p_card2 = create_card(9, 9, 9, 9, CardType::None);

        let state = create_initial_state(
            vec![p_card1, p_card2, filler, filler, filler],
            vec![filler, filler, filler, filler, filler],
            Owner::Player,
            RuleSet::default(),
        );

        // Turn 1: Player places p_card1 at pos 0
        let s = place_card(&state, p_card1, 0);
        // Turn 2: Opponent places filler at pos 8 (far corner)
        let s = place_card(&s, filler, 8);
        // Turn 3: Player places p_card2 at pos 1 (adjacent to 0, higher values)
        let s = place_card(&s, p_card2, 1);

        // p_card1 at pos 0 should still be owned by Player (no self-capture)
        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_standard_capture_multiple() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let op_card1 = create_card(1, 1, 2, 1, CardType::None); // bottom=2, at pos 1 defends top
        let op_card2 = create_card(1, 2, 1, 1, CardType::None); // right=2, at pos 3 defends left
        let p_card = create_card(5, 5, 5, 5, CardType::None);   // all-5, placed at center pos 4

        let state = create_initial_state(
            vec![filler, filler, p_card, filler, filler],
            vec![op_card1, op_card2, filler, filler, filler],
            Owner::Player,
            RuleSet::default(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op_card1, 1);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, op_card2, 3);
        let s = place_card(&s, p_card, 4); // captures both adjacent opponent cards

        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[1].unwrap().card, op_card1);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().card, op_card2);
    }

    // ── Same rule ─────────────────────────────────────────────────────────────

    #[test]
    fn test_same_captures_when_two_or_more_equal_pairs() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        // op1 at pos 1: bottom=5. op2 at pos 3: right=7.
        // p_card at pos 4: top=5 (matches op1 bottom), left=7 (matches op2 right)
        let op1 = create_card(1, 1, 5, 1, CardType::None); // bottom=5
        let op2 = create_card(1, 7, 1, 1, CardType::None); // right=7
        let p_card = create_card(5, 1, 1, 7, CardType::None); // top=5, left=7

        let state = create_initial_state(
            vec![filler, filler, filler, filler, p_card],
            vec![op1, op2, filler, filler, filler],
            Owner::Player,
            same_rules(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op1, 1);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, op2, 3);
        let s = place_card(&s, p_card, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_same_no_trigger_with_only_one_matching_pair() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        // op1 at pos 1: bottom=5. op2 at pos 3: right=9. p_card: top=5 (matches), left=7 (does NOT match 9)
        let op1 = create_card(1, 1, 5, 1, CardType::None); // bottom=5
        let op2 = create_card(1, 9, 1, 1, CardType::None); // right=9
        let p_card = create_card(5, 1, 1, 7, CardType::None); // top=5, left=7

        let state = create_initial_state(
            vec![filler, filler, filler, filler, p_card],
            vec![op1, op2, filler, filler, filler],
            Owner::Player,
            same_rules(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op1, 1);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, op2, 3);
        let s = place_card(&s, p_card, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Opponent);
        assert_eq!(s.board[3].unwrap().owner, Owner::Opponent);
    }

    #[test]
    fn test_same_counts_friendly_but_does_not_flip_them() {
        reset_card_ids();
        // p_card1 (Player) at pos 1: bottom=5. op_card (Opponent) at pos 3: right=7.
        // p_card2 (Player) at pos 4: top=5 (same as p_card1 bottom), left=7 (same as op_card right)
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let p_card1 = create_card(1, 1, 5, 1, CardType::None); // bottom=5
        let op_card = create_card(1, 7, 1, 1, CardType::None); // right=7
        let p_card2 = create_card(5, 1, 1, 7, CardType::None); // top=5, left=7

        let state = create_initial_state(
            vec![p_card1, filler, filler, filler, p_card2],
            vec![op_card, filler, filler, filler, filler],
            Owner::Player,
            same_rules(),
        );

        let s = place_card(&state, p_card1, 1);
        let s = place_card(&s, op_card, 3);
        let s = place_card(&s, filler, 8);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, p_card2, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Player); // friendly, not flipped
        assert_eq!(s.board[3].unwrap().owner, Owner::Player); // opponent, flipped
    }

    // ── Plus rule ─────────────────────────────────────────────────────────────

    #[test]
    fn test_plus_captures_when_two_or_more_equal_sums() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        // op1 at pos 1: bottom=5. op2 at pos 3: right=7.
        // p_card at pos 4: top=3 (sum 3+5=8), left=1 (sum 1+7=8)
        let op1 = create_card(1, 1, 5, 1, CardType::None); // bottom=5
        let op2 = create_card(1, 7, 1, 1, CardType::None); // right=7
        let p_card = create_card(3, 1, 1, 1, CardType::None); // top=3, left=1

        let state = create_initial_state(
            vec![filler, filler, filler, filler, p_card],
            vec![op1, op2, filler, filler, filler],
            Owner::Player,
            plus_rules(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op1, 1);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, op2, 3);
        let s = place_card(&s, p_card, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_plus_no_trigger_with_only_one_pair() {
        reset_card_ids();
        let filler = create_card(1, 1, 1, 1, CardType::None);
        // op_card at pos 1: bottom=5. p_card at pos 4: top=3 (sum=8) but only 1 adjacent opponent card
        let op_card = create_card(1, 1, 5, 1, CardType::None); // bottom=5
        let p_card = create_card(3, 1, 1, 1, CardType::None); // top=3

        let state = create_initial_state(
            vec![filler, filler, filler, filler, p_card],
            vec![op_card, filler, filler, filler, filler],
            Owner::Player,
            plus_rules(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op_card, 1);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, filler, 3);
        let s = place_card(&s, p_card, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Opponent);
    }

    #[test]
    fn test_plus_counts_friendly_but_does_not_flip_them() {
        reset_card_ids();
        // p_card1 (Player) at pos 1: bottom=5. op_card (Opponent) at pos 3: right=7.
        // p_card2 at pos 4: top=3 (sum with p_card1: 3+5=8), left=1 (sum with op_card: 1+7=8)
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let p_card1 = create_card(1, 1, 5, 1, CardType::None); // bottom=5
        let op_card = create_card(1, 7, 1, 1, CardType::None); // right=7
        let p_card2 = create_card(3, 1, 1, 1, CardType::None); // top=3, left=1

        let state = create_initial_state(
            vec![p_card1, filler, filler, filler, p_card2],
            vec![op_card, filler, filler, filler, filler],
            Owner::Player,
            plus_rules(),
        );

        let s = place_card(&state, p_card1, 1);
        let s = place_card(&s, op_card, 3);
        let s = place_card(&s, filler, 8);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, p_card2, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Player); // friendly, not flipped
        assert_eq!(s.board[3].unwrap().owner, Owner::Player); // opponent, flipped
    }

    // ── Combo cascade ─────────────────────────────────────────────────────────

    #[test]
    fn test_combo_flipped_cards_trigger_standard_captures() {
        reset_card_ids();
        // opp0 at 0: (1,1,1,1), opp1 at 1: (1,1,7,9) bottom=7(same pair), left=9(combo attacker)
        // opp3 at 3: (1,3,1,1) right=3(same pair). plr4: (7,1,1,3) top=7, left=3 → Same triggers
        // Same flips pos 1 and pos 3. Combo from pos 1: left=9 > pos 0's right=1 → flip pos 0
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let opp0 = create_card(1, 1, 1, 1, CardType::None);
        let opp1 = create_card(1, 1, 7, 9, CardType::None); // bottom=7(same pair), left=9(combo attacker)
        let opp3 = create_card(1, 3, 1, 1, CardType::None); // right=3
        let plr4 = create_card(7, 1, 1, 3, CardType::None); // top=7, left=3

        let state = create_initial_state(
            vec![filler, filler, filler, filler, plr4],
            vec![opp0, opp1, opp3, filler, filler],
            Owner::Player,
            same_rules(),
        );

        // Setup: opp0@0, opp1@1, opp3@3, then Player places plr4@4
        let s = place_card(&state, filler, 8); // Player
        let s = place_card(&s, opp0, 0);       // Opponent
        let s = place_card(&s, filler, 6);     // Player
        let s = place_card(&s, opp1, 1);       // Opponent
        let s = place_card(&s, filler, 2);     // Player
        let s = place_card(&s, opp3, 3);       // Opponent
        let s = place_card(&s, plr4, 4);       // Player — Same triggers (pos1+pos3), Combo flips pos0

        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_combo_does_not_retrigger_plus_or_same() {
        reset_card_ids();
        // Similar layout but opp1.left=5 vs opp0.right=5 → 5>5 is false → no combo capture
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let opp0 = create_card(1, 5, 1, 1, CardType::None); // right=5
        let opp1 = create_card(1, 1, 7, 5, CardType::None); // bottom=7(same pair), left=5(combo attempt: 5>5 false)
        // opp1 left=5, opp0 right=5 → standard: 5>5? No → no combo capture
        // Same triggers first: plr4 top=7 vs opp1 bottom=7, plr4 left=3 vs opp3 right=3
        let opp3 = create_card(1, 3, 1, 1, CardType::None); // right=3
        let plr4 = create_card(7, 1, 1, 3, CardType::None); // top=7, left=3

        let state = create_initial_state(
            vec![filler, filler, filler, filler, plr4],
            vec![opp0, opp1, opp3, filler, filler],
            Owner::Player,
            same_rules(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, opp0, 0);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, opp1, 1);
        let s = place_card(&s, filler, 2);
        let s = place_card(&s, opp3, 3);
        let s = place_card(&s, plr4, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
        assert_eq!(s.board[0].unwrap().owner, Owner::Opponent); // 5>5 is false, no combo capture
    }

    // ── Edge cases ────────────────────────────────────────────────────────────

    #[test]
    fn test_corner_card_has_only_two_neighbors() {
        reset_card_ids();
        // op1 at pos 1: left=2. op2 at pos 3: top=2. p_card at pos 0: right=5, bottom=5
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let op1 = create_card(1, 1, 1, 2, CardType::None); // left=2
        let op2 = create_card(2, 1, 1, 1, CardType::None); // top=2
        let p_card = create_card(1, 5, 5, 1, CardType::None); // right=5, bottom=5

        let state = create_initial_state(
            vec![filler, filler, filler, filler, p_card],
            vec![op1, op2, filler, filler, filler],
            Owner::Player,
            no_rules(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op1, 1);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, op2, 3);
        let s = place_card(&s, p_card, 0);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_edge_card_has_only_three_neighbors() {
        reset_card_ids();
        // op0 at pos 0: right=2. op2 at pos 2: left=2. op4 at pos 4: top=2.
        // p_card at pos 1: left=5, right=5, bottom=5
        let filler = create_card(1, 1, 1, 1, CardType::None);
        let op0 = create_card(1, 2, 1, 1, CardType::None); // right=2
        let op2 = create_card(1, 1, 1, 2, CardType::None); // left=2
        let op4 = create_card(2, 1, 1, 1, CardType::None); // top=2
        let p_card = create_card(1, 5, 5, 5, CardType::None); // left=5, right=5, bottom=5

        let state = create_initial_state(
            vec![filler, filler, filler, p_card, filler],
            vec![op0, op2, op4, filler, filler],
            Owner::Player,
            no_rules(),
        );

        let s = place_card(&state, filler, 8);
        let s = place_card(&s, op0, 0);
        let s = place_card(&s, filler, 6);
        let s = place_card(&s, op2, 2);
        let s = place_card(&s, filler, 7);
        let s = place_card(&s, op4, 4);
        let s = place_card(&s, p_card, 1);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[2].unwrap().owner, Owner::Player);
        assert_eq!(s.board[4].unwrap().owner, Owner::Player);
    }

    // ── Full game test (9-turn with Plus rule) ────────────────────────────────

    #[test]
    fn test_full_game_nine_turns_with_plus_rule() {
        reset_card_ids();
        // p = (5,5,5,5), o = (3,3,3,3), 5-card hands
        let p = create_card(5, 5, 5, 5, CardType::None);
        let o = create_card(3, 3, 3, 3, CardType::None);

        let state = create_initial_state(
            vec![p, p, p, p, p],
            vec![o, o, o, o, o],
            Owner::Player,
            plus_rules(),
        );

        // P@0
        let s = place_card(&state, p, 0);
        // O@1
        let s = place_card(&s, o, 1);
        // P@2: captures pos 1 (p.left=5 > o.right=3... wait, pos2.left attacks pos1.right)
        // Actually pos2 left=5 attacks pos1 right=3 → 5>3 → capture
        let s = place_card(&s, p, 2);
        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        // O@3
        let s = place_card(&s, o, 3);
        // P@4: Plus triggers — p(4).top=5+o(1).bottom=3=8 and p(4).left=5+o(3).right=3=8 → flip 1 and 3
        let s = place_card(&s, p, 4);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
        // O@5: Plus — o(5).top=3+p(2).bottom=5=8 and o(5).left=3+p(4).right=5=8 → flip 2 and 4, combo flips 1 and 3
        let s = place_card(&s, o, 5);
        assert_eq!(s.board[2].unwrap().owner, Owner::Opponent);
        assert_eq!(s.board[4].unwrap().owner, Owner::Opponent);
        assert_eq!(s.board[1].unwrap().owner, Owner::Opponent);
        assert_eq!(s.board[3].unwrap().owner, Owner::Opponent);
        // P@6: captures pos 3 (p.top=5 > o.bottom=3? pos6.top attacks pos3.bottom: 5>3 → capture)
        let s = place_card(&s, p, 6);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
        // O@7: Plus — o(7).top=3+p(4).bottom=5=8 and o(7).left=3+p(6).right=5=8 → flip 4 and 6, combo flips 3
        let s = place_card(&s, o, 7);
        assert_eq!(s.board[6].unwrap().owner, Owner::Opponent);
        assert_eq!(s.board[3].unwrap().owner, Owner::Opponent);
        // P@8: Plus — p(8).top=5+o(5).bottom=3=8 and p(8).left=5+o(7).right=3=8 → flip 5 and 7
        let s = place_card(&s, p, 8);
        assert_eq!(s.board[7].unwrap().owner, Owner::Player);
        assert_eq!(s.board[5].unwrap().owner, Owner::Player);

        // Final state
        for pos in 0..9 {
            assert!(s.board[pos].is_some(), "pos {} is empty", pos);
        }
        assert_eq!(s.player_hand.len(), 0);
        assert_eq!(s.opponent_hand.len(), 1);
        let (ps, os) = get_score(&s);
        assert_eq!((ps, os), (4, 6));
    }

    // ── Combined Plus+Same simultaneously ────────────────────────────────────

    #[test]
    fn test_combined_plus_and_same_simultaneously() {
        reset_card_ids();
        // p_card at pos 4: (3,7,4,2)
        // opp1 at pos 1: (1,1,3,1) bottom=3. opp3 at pos 3: (1,8,1,1) right=8.
        // opp5 at pos 5: (1,1,1,7) left=7. opp7 at pos 7: (6,1,1,1) top=6.
        // Same: p.top(3)==opp1.bottom(3), p.right(7)==opp5.left(7) → flips pos 1, pos 5
        // Plus: p.left(2)+opp3.right(8)=10, p.bottom(4)+opp7.top(6)=10 → flips pos 3, pos 7
        let p_card = create_card(3, 7, 4, 2, CardType::None);
        let opp1 = create_card(1, 1, 3, 1, CardType::None); // bottom=3
        let opp3 = create_card(1, 8, 1, 1, CardType::None); // right=8
        let opp5 = create_card(1, 1, 1, 7, CardType::None); // left=7
        let opp7 = create_card(6, 1, 1, 1, CardType::None); // top=6

        // Direct board construction — pre-populate without going through place_card turns
        let board: Board = {
            let mut b = [None; 9];
            b[1] = Some(PlacedCard { card: opp1, owner: Owner::Opponent });
            b[3] = Some(PlacedCard { card: opp3, owner: Owner::Opponent });
            b[5] = Some(PlacedCard { card: opp5, owner: Owner::Opponent });
            b[7] = Some(PlacedCard { card: opp7, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_card],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { plus: true, same: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_card, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[5].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
        assert_eq!(s.board[7].unwrap().owner, Owner::Player);
    }

    // ── Combo cascade depth ───────────────────────────────────────────────────

    #[test]
    fn test_combo_cascade_depth() {
        reset_card_ids();
        // p_card at pos 4: (5,1,5,1) — top=5, bottom=5 → Same pairs with pos1 and pos7
        // opp1 at pos 1: (1,1,5,1) — bottom=5 (Same pair)
        // opp7 at pos 7: (5,1,1,9) — top=5 (Same pair), right=9 (combo attacker toward pos 8? no — left attacks pos 6)
        // Wait, let's re-read: "opp7 at pos 7: (5,1,1,9) — top=5 (Same pair), left=9"
        // ADJACENCY[7]: left neighbor is pos 6, right neighbor is pos 8, top neighbor is pos 4
        // opp7.left=9 attacks pos6's right edge
        // opp6 at pos 6: (8,1,1,1) — top=8 (combo attacker toward pos 3), right=1 (weak vs pos7 left? already flipped)
        // opp3 at pos 3: (1,1,1,1) — just target for combo depth 2
        // Combo depth 1: opp7 (now Player) left=9 > opp6.right=1 → flip pos 6
        // Combo depth 2: opp6 (now Player) top=8 > opp3.bottom=1 → flip pos 3
        let p_card = create_card(5, 1, 5, 1, CardType::None); // top=5, bottom=5
        let opp1 = create_card(1, 1, 5, 1, CardType::None);   // bottom=5
        let opp7 = create_card(5, 1, 1, 9, CardType::None);   // top=5, left=9
        let opp6 = create_card(8, 1, 1, 1, CardType::None);   // top=8
        let opp3 = create_card(1, 1, 1, 1, CardType::None);   // all-1s

        let board: Board = {
            let mut b = [None; 9];
            b[1] = Some(PlacedCard { card: opp1, owner: Owner::Opponent });
            b[3] = Some(PlacedCard { card: opp3, owner: Owner::Opponent });
            b[6] = Some(PlacedCard { card: opp6, owner: Owner::Opponent });
            b[7] = Some(PlacedCard { card: opp7, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_card],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: same_rules(),
        };

        let s = place_card(&state, p_card, 4);

        assert_eq!(s.board[1].unwrap().owner, Owner::Player); // Same
        assert_eq!(s.board[7].unwrap().owner, Owner::Player); // Same
        assert_eq!(s.board[6].unwrap().owner, Owner::Player); // Combo depth 1
        assert_eq!(s.board[3].unwrap().owner, Owner::Player); // Combo depth 2
    }

    // ── Reverse rule ──────────────────────────────────────────────────────────

    #[test]
    fn test_reverse_higher_value_does_not_capture() {
        reset_card_ids();
        // p=(7,1,1,1), o=(1,1,5,1). Opponent places at pos 0 (bottom=5), player at pos 3 (top=7 attacks pos0 bottom=5)
        // Under Reverse: 7<5? No → no capture.
        let p = create_card(7, 1, 1, 1, CardType::None); // top=7
        let o = create_card(1, 1, 5, 1, CardType::None); // bottom=5

        let state = create_initial_state(
            vec![p],
            vec![o],
            Owner::Opponent,
            RuleSet { reverse: true, ..RuleSet::default() },
        );

        let s = place_card(&state, o, 0);
        let s = place_card(&s, p, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Opponent); // no capture
    }

    #[test]
    fn test_reverse_lower_value_captures() {
        reset_card_ids();
        // p=(3,1,1,1), o=(1,1,7,1). Opponent@0 (bottom=7), player@3 (top=3 attacks bottom=7)
        // Under Reverse: 3<7 → capture.
        let p = create_card(3, 1, 1, 1, CardType::None); // top=3
        let o = create_card(1, 1, 7, 1, CardType::None); // bottom=7

        let state = create_initial_state(
            vec![p],
            vec![o],
            Owner::Opponent,
            RuleSet { reverse: true, ..RuleSet::default() },
        );

        let s = place_card(&state, o, 0);
        let s = place_card(&s, p, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    // ── Fallen Ace rule ───────────────────────────────────────────────────────

    #[test]
    fn test_fallen_ace_ten_still_captures_one() {
        reset_card_ids();
        // p=(10,1,1,1), o=(1,1,1,1). Opp@0 (bottom=1), player@3 (top=10 attacks bottom=1)
        // Normal rule: 10>1 → capture. No FallenAce special needed.
        let p = create_card(10, 1, 1, 1, CardType::None); // top=10
        let o = create_card(1, 1, 1, 1, CardType::None);  // bottom=1

        let state = create_initial_state(
            vec![p],
            vec![o],
            Owner::Opponent,
            RuleSet { fallen_ace: true, ..RuleSet::default() },
        );

        let s = place_card(&state, o, 0);
        let s = place_card(&s, p, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_fallen_ace_one_captures_ten() {
        reset_card_ids();
        // p=(1,1,1,1), o=(1,1,10,1). Opp@0 (bottom=10), player@3 (top=1 attacks bottom=10)
        // FallenAce: 1 captures 10.
        let p = create_card(1, 1, 1, 1, CardType::None);  // top=1
        let o = create_card(1, 1, 10, 1, CardType::None); // bottom=10

        let state = create_initial_state(
            vec![p],
            vec![o],
            Owner::Opponent,
            RuleSet { fallen_ace: true, ..RuleSet::default() },
        );

        let s = place_card(&state, o, 0);
        let s = place_card(&s, p, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_fallen_ace_normal_captures_still_apply() {
        reset_card_ids();
        // p=(7,1,1,1), o=(1,1,5,1). Opp@0 (bottom=5), player@3 (top=7 attacks bottom=5)
        // Normal: 7>5 → capture. FallenAce rule is active but doesn't change this.
        let p = create_card(7, 1, 1, 1, CardType::None); // top=7
        let o = create_card(1, 1, 5, 1, CardType::None); // bottom=5

        let state = create_initial_state(
            vec![p],
            vec![o],
            Owner::Opponent,
            RuleSet { fallen_ace: true, ..RuleSet::default() },
        );

        let s = place_card(&state, o, 0);
        let s = place_card(&s, p, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_fallen_ace_ten_captures_one_with_reverse() {
        reset_card_ids();
        // p=(10,1,1,1), o=(1,1,1,1). Opp@0 (bottom=1), player@3 (top=10 attacks bottom=1)
        // Reverse+FallenAce: 10 captures 1 via FallenAce special case.
        let p = create_card(10, 1, 1, 1, CardType::None); // top=10
        let o = create_card(1, 1, 1, 1, CardType::None);  // bottom=1

        let state = create_initial_state(
            vec![p],
            vec![o],
            Owner::Opponent,
            RuleSet { reverse: true, fallen_ace: true, ..RuleSet::default() },
        );

        let s = place_card(&state, o, 0);
        let s = place_card(&s, p, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_fallen_ace_one_captures_ten_with_reverse() {
        reset_card_ids();
        // p=(1,1,1,1), o=(1,1,10,1). Opp@0 (bottom=10), player@3 (top=1 attacks bottom=10)
        // Reverse alone: 1<10 → capture. FallenAce doesn't change this.
        let p = create_card(1, 1, 1, 1, CardType::None);  // top=1
        let o = create_card(1, 1, 10, 1, CardType::None); // bottom=10

        let state = create_initial_state(
            vec![p],
            vec![o],
            Owner::Opponent,
            RuleSet { reverse: true, fallen_ace: true, ..RuleSet::default() },
        );

        let s = place_card(&state, o, 0);
        let s = place_card(&s, p, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    // ── Ascension rule ────────────────────────────────────────────────────────

    #[test]
    fn test_ascension_boosts_attacking_card() {
        reset_card_ids();
        // 2 Primals on board. Player Primal top=5 (+2=7). Opp Garlean bottom=5 (+1=6). 7>6 → capture.
        // Without Ascension: 5>5 → no capture.
        let opp_primal1 = create_card(1, 1, 1, 1, CardType::Primal); // pos 2: Primal filler
        let opp_primal2 = create_card(1, 1, 1, 1, CardType::Primal); // pos 5: Primal filler
        let opp_garlean = create_card(1, 1, 5, 1, CardType::Garlean); // pos 0, bottom=5
        let p_primal = create_card(5, 1, 1, 1, CardType::Primal);     // top=5

        let board: Board = {
            let mut b = [None; 9];
            b[0] = Some(PlacedCard { card: opp_garlean, owner: Owner::Opponent });
            b[2] = Some(PlacedCard { card: opp_primal1, owner: Owner::Opponent });
            b[5] = Some(PlacedCard { card: opp_primal2, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_primal],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { ascension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_primal, 3); // top=5+2=7 > Garlean 5+1=6 → capture

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_ascension_boosts_defending_card() {
        reset_card_ids();
        // 1 Primal (the defender) on board. Player None top=7 vs opp Primal bottom=6.
        // typeCounts[Primal]=1, typeCounts[None]=0. 7+0=7, 6+1=7. 7>7? No → no capture.
        let opp_primal = create_card(1, 1, 6, 1, CardType::Primal); // pos 0, bottom=6
        let p_none = create_card(7, 1, 1, 1, CardType::None);       // top=7

        let board: Board = {
            let mut b = [None; 9];
            b[0] = Some(PlacedCard { card: opp_primal, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_none],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { ascension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_none, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Opponent); // no capture
    }

    #[test]
    fn test_ascension_boosts_all_types_not_just_primal() {
        reset_card_ids();
        // 1 Primal on board. Player None top=5, opp None bottom=5.
        // typeCounts[Primal]=1, typeCounts[None]=1 (the opp None).
        // Both Nones get +1: 5+1=6 vs 5+1=6. 6>6? No → no capture (equal boost, no advantage).
        let primal_filler = create_card(1, 1, 1, 1, CardType::Primal);
        let opp_none = create_card(1, 1, 5, 1, CardType::None);
        let p_none = create_card(5, 1, 1, 1, CardType::None);

        let board: Board = {
            let mut b = [None; 9];
            b[2] = Some(PlacedCard { card: primal_filler, owner: Owner::Opponent });
            b[1] = Some(PlacedCard { card: opp_none, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_none],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { ascension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_none, 4); // both Nones boosted equally: 6 vs 6 → no capture

        assert_eq!(s.board[1].unwrap().owner, Owner::Opponent);
    }

    #[test]
    fn test_ascension_caps_boosted_value_at_ten() {
        reset_card_ids();
        // 3 Primals on board. Player Primal top=9 (9+3=12 → capped to 10). Opp Garlean bottom=9 (+1=10). 10>10? No.
        // Without cap: 12>10 → capture.
        let primal1 = create_card(1, 1, 1, 1, CardType::Primal);
        let primal2 = create_card(1, 1, 1, 1, CardType::Primal);
        let primal3 = create_card(1, 1, 1, 1, CardType::Primal);
        let opp_garlean = create_card(1, 1, 9, 1, CardType::Garlean); // pos 1, bottom=9
        let p_primal = create_card(9, 1, 1, 1, CardType::Primal);     // top=9

        let board: Board = {
            let mut b = [None; 9];
            b[2] = Some(PlacedCard { card: primal1, owner: Owner::Opponent });
            b[5] = Some(PlacedCard { card: primal2, owner: Owner::Opponent });
            b[8] = Some(PlacedCard { card: primal3, owner: Owner::Opponent });
            b[1] = Some(PlacedCard { card: opp_garlean, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_primal],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { ascension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_primal, 4); // min(10, 9+3)=10 vs Garlean 9+1=10. 10>10 false.

        assert_eq!(s.board[1].unwrap().owner, Owner::Opponent); // cap prevents capture
    }

    #[test]
    fn test_ascension_placed_card_does_not_count_itself() {
        reset_card_ids();
        // 1 Primal filler on board. Player Primal top=5: typeCounts[Primal]=1 (filler only, not itself).
        // Player Primal 5+1=6 vs opp Garlean 5+1=6. 6>6? No → no capture.
        // If placed Primal counted itself: typeCounts[Primal]=2 → top=7 > 6 → capture (wrong).
        let primal_filler = create_card(1, 1, 1, 1, CardType::Primal); // pos 2: Primal for count
        let opp_garlean = create_card(1, 1, 5, 1, CardType::Garlean); // pos 0, bottom=5
        let p_primal = create_card(5, 1, 1, 1, CardType::Primal);     // top=5

        let board: Board = {
            let mut b = [None; 9];
            b[0] = Some(PlacedCard { card: opp_garlean, owner: Owner::Opponent });
            b[2] = Some(PlacedCard { card: primal_filler, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_primal],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { ascension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_primal, 3); // typeCounts[Primal]=1 (filler only). 5+1=6 vs 5+1=6. No capture.

        assert_eq!(s.board[0].unwrap().owner, Owner::Opponent);
    }

    #[test]
    fn test_ascension_uses_modified_values_for_same_rule() {
        reset_card_ids();
        // 2 Primals on board. Player Primal at pos 4: top=3 (+2=5), left=2 (+2=4).
        // Opp Garlean at pos 1 (bottom=4, +1=5), opp Society at pos 3 (right=3, +1=4).
        // Without Ascension: 3≠4, 2≠3 → no Same. With: 5==5, 4==4 → Same triggers.
        let primal1 = create_card(1, 1, 1, 1, CardType::Primal);
        let primal2 = create_card(1, 1, 1, 1, CardType::Primal);
        let opp_garlean = create_card(1, 1, 4, 1, CardType::Garlean); // pos 1, bottom=4
        let opp_society = create_card(1, 3, 1, 1, CardType::Society); // pos 3, right=3
        let p_primal = create_card(3, 1, 1, 2, CardType::Primal);     // top=3, left=2

        let board: Board = {
            let mut b = [None; 9];
            b[2] = Some(PlacedCard { card: primal1, owner: Owner::Opponent });
            b[5] = Some(PlacedCard { card: primal2, owner: Owner::Opponent });
            b[1] = Some(PlacedCard { card: opp_garlean, owner: Owner::Opponent });
            b[3] = Some(PlacedCard { card: opp_society, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_primal],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { same: true, ascension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_primal, 4);

        // typeCounts[Primal]=2, typeCounts[Garlean]=1, typeCounts[Society]=1.
        // top=3+2=5==Garlean(4+1=5), left=2+2=4==Society(3+1=4). Same triggers → both flip.
        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
        assert_eq!(s.board[3].unwrap().owner, Owner::Player);
    }

    // ── Descension rule ───────────────────────────────────────────────────────

    #[test]
    fn test_descension_penalizes_attacking_card() {
        reset_card_ids();
        // 2 Scions on board. Player Scion top=6 (-2=4). Opp Garlean bottom=5 (-1=4). 4>4? No → no capture.
        // Without Descension: 6>5 → capture.
        let scion1 = create_card(1, 1, 1, 1, CardType::Scion); // pos 2: Scion filler
        let scion2 = create_card(1, 1, 1, 1, CardType::Scion); // pos 5: Scion filler
        let opp_garlean = create_card(1, 1, 5, 1, CardType::Garlean); // pos 0, bottom=5
        let p_scion = create_card(6, 1, 1, 1, CardType::Scion);       // top=6

        let board: Board = {
            let mut b = [None; 9];
            b[0] = Some(PlacedCard { card: opp_garlean, owner: Owner::Opponent });
            b[2] = Some(PlacedCard { card: scion1, owner: Owner::Opponent });
            b[5] = Some(PlacedCard { card: scion2, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_scion],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { descension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_scion, 3); // top=6-2=4 vs Garlean 5-1=4. 4>4? No → no capture

        assert_eq!(s.board[0].unwrap().owner, Owner::Opponent);
    }

    #[test]
    fn test_descension_penalizes_defending_card() {
        reset_card_ids();
        // 2 Scions on board. typeCounts[Scion]=2, typeCounts[None]=0.
        // Player None top=7 (-0=7). Opp Scion bottom=7 (-2=5). 7>5 → capture.
        let scion1 = create_card(1, 1, 1, 1, CardType::Scion);
        let scion2 = create_card(1, 1, 7, 1, CardType::Scion); // pos 0, bottom=7
        let p_none = create_card(7, 1, 1, 1, CardType::None);  // top=7

        let board: Board = {
            let mut b = [None; 9];
            b[2] = Some(PlacedCard { card: scion1, owner: Owner::Opponent });
            b[0] = Some(PlacedCard { card: scion2, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_none],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { descension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_none, 3);

        assert_eq!(s.board[0].unwrap().owner, Owner::Player);
    }

    #[test]
    fn test_descension_both_same_type_penalized_equally() {
        reset_card_ids();
        // 1 Scion on board. Player None top=5, opp None bottom=4.
        // typeCounts[Scion]=1, typeCounts[None]=1 (the opp None).
        // Both Nones penalized: 5-1=4 > 4-1=3 → capture (equal penalty, larger value still wins).
        let scion_filler = create_card(1, 1, 1, 1, CardType::Scion);
        let opp_none = create_card(1, 1, 4, 1, CardType::None); // pos 1, bottom=4
        let p_none = create_card(5, 1, 1, 1, CardType::None);   // top=5

        let board: Board = {
            let mut b = [None; 9];
            b[2] = Some(PlacedCard { card: scion_filler, owner: Owner::Opponent });
            b[1] = Some(PlacedCard { card: opp_none, owner: Owner::Opponent });
            b
        };
        let state = GameState {
            board,
            player_hand: vec![p_none],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { descension: true, ..RuleSet::default() },
        };

        let s = place_card(&state, p_none, 4); // 5-1=4 > 4-1=3 → capture

        assert_eq!(s.board[1].unwrap().owner, Owner::Player);
    }

    // ── place_card_mut / undo_place ──────────────────────────────────────────

    #[test]
    fn place_card_mut_and_undo_restores_state() {
        // Case 1: simple placement (no capture)
        reset_card_ids();
        let p_card = create_card(5, 5, 5, 5, CardType::None);
        let o_card = create_card(3, 3, 3, 3, CardType::None);
        let state = create_initial_state(vec![p_card], vec![o_card], Owner::Player, no_rules());
        let original = state.clone();
        let mut state_mut = state.clone();
        let undo = place_card_mut(&mut state_mut, p_card, 4);
        undo_place(&mut state_mut, undo);
        assert_eq!(state_mut, original, "Case 1: simple placement undo failed");

        // Case 2: placement with a standard capture
        reset_card_ids();
        let strong = create_card(10, 10, 10, 10, CardType::None);
        let weak = create_card(1, 1, 1, 1, CardType::None);
        let filler = create_card(5, 5, 5, 5, CardType::None);
        let mut state2 = create_initial_state(
            vec![strong, filler, filler, filler, filler],
            vec![weak, filler, filler, filler, filler],
            Owner::Player,
            no_rules(),
        );
        // Place weak opponent card at pos 1 first
        state2 = place_card(&state2, filler, 8);
        state2 = place_card(&state2, weak, 1);
        state2 = place_card(&state2, filler, 6);
        state2 = place_card(&state2, filler, 7);
        // state2 is now Player's turn; place strong card at pos 0 (right=10 beats weak at pos 1 left=1)
        // Verify immutable place_card captures
        let after_immutable = place_card(&state2, strong, 0);
        assert_eq!(after_immutable.board[1].unwrap().owner, Owner::Player, "Setup: capture should happen");
        // Now verify mut + undo restores state2
        let original2 = state2.clone();
        let mut state2_mut = state2.clone();
        let undo2 = place_card_mut(&mut state2_mut, strong, 0);
        // Verify the mutable version matches the immutable version
        assert_eq!(state2_mut.board, after_immutable.board, "Case 2: mut result should match immutable");
        assert_eq!(state2_mut.player_hand, after_immutable.player_hand, "Case 2: hands should match");
        // Undo and verify restoration
        undo_place(&mut state2_mut, undo2);
        assert_eq!(state2_mut, original2, "Case 2: capture undo failed");

        // Case 3: placement with Same rule triggering flip + undo
        // p_same2 at pos 4: top=5 matches o_above.bottom=5 (at pos1), left=3 matches o_left.right=3 (at pos3)
        // Two pairs with equal touching values → Same fires, both flip to Player
        reset_card_ids();
        let p_same2 = create_card(5, 3, 3, 3, CardType::None);
        let o_above = create_card(3, 3, 5, 3, CardType::None); // bottom=5 faces p_same2 top=5
        let o_left  = create_card(3, 3, 3, 3, CardType::None); // right=3 faces p_same2 left=3
        let state3 = GameState {
            board: {
                let mut b = [None; 9];
                b[1] = Some(PlacedCard { card: o_above, owner: Owner::Opponent });
                b[3] = Some(PlacedCard { card: o_left,  owner: Owner::Opponent });
                b
            },
            player_hand: vec![p_same2],
            opponent_hand: vec![],
            current_turn: Owner::Player,
            rules: RuleSet { same: true, ..RuleSet::default() },
        };
        let after_same_immutable = place_card(&state3, p_same2, 4);
        // Both o_above and o_left should be captured via Same
        assert_eq!(after_same_immutable.board[1].unwrap().owner, Owner::Player, "Case 3 setup: Same flip at pos1");
        assert_eq!(after_same_immutable.board[3].unwrap().owner, Owner::Player, "Case 3 setup: Same flip at pos3");
        let original3 = state3.clone();
        let mut state3_mut = state3.clone();
        let undo3 = place_card_mut(&mut state3_mut, p_same2, 4);
        assert_eq!(state3_mut.board, after_same_immutable.board, "Case 3: mut result should match immutable");
        undo_place(&mut state3_mut, undo3);
        assert_eq!(state3_mut, original3, "Case 3: Same rule undo failed");
    }
}
