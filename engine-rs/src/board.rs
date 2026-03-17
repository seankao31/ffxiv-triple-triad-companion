// ABOUTME: Game logic for card placement and capture resolution.
// ABOUTME: Handles standard capture; Plus, Same, Combo, and other rule modifiers are added in Step 3.

use crate::types::{Card, Edge, GameState, Owner, PlacedCard, ADJACENCY};

pub(crate) fn card_edge_value(card: &Card, edge: Edge) -> u8 {
    match edge {
        Edge::Top => card.top,
        Edge::Right => card.right,
        Edge::Bottom => card.bottom,
        Edge::Left => card.left,
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

    let mut new_board = state.board;
    new_board[position] = Some(PlacedCard { card, owner: state.current_turn });

    // Standard capture: flip adjacent opponent cards when attacker edge > defender edge
    for neighbor in ADJACENCY[position] {
        if let Some(neighbor_cell) = new_board[neighbor.position as usize] {
            if neighbor_cell.owner != state.current_turn {
                let attack_val = card_edge_value(&card, neighbor.attacking_edge);
                let defend_val = card_edge_value(&neighbor_cell.card, neighbor.defending_edge);
                if attack_val > defend_val {
                    new_board[neighbor.position as usize] =
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CardType, Owner, PlacedCard, RuleSet, create_card, create_initial_state, reset_card_ids};

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
}
