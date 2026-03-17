// ABOUTME: Core data types for the Triple Triad game engine.
// ABOUTME: Defines Card, GameState, Owner, and related types ported from types.ts.

use std::cell::Cell;

thread_local! {
    static NEXT_CARD_ID: Cell<u8> = const { Cell::new(0) };
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardType {
    None,
    Primal,
    Scion,
    Society,
    Garlean,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Owner {
    Player,
    Opponent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Card {
    pub id: u8,
    pub top: u8,
    pub right: u8,
    pub bottom: u8,
    pub left: u8,
    pub card_type: CardType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlacedCard {
    pub card: Card,
    pub owner: Owner,
}

// 3x3 board, row-major: [0,1,2] = top row, [3,4,5] = middle, [6,7,8] = bottom
pub type Board = [Option<PlacedCard>; 9];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RuleSet {
    pub plus: bool,
    pub same: bool,
    pub reverse: bool,
    pub fallen_ace: bool,
    pub ascension: bool,
    pub descension: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameState {
    pub board: Board,
    pub player_hand: Vec<Card>,
    pub opponent_hand: Vec<Card>,
    pub current_turn: Owner,
    pub rules: RuleSet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Win,
    Draw,
    Loss,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RankedMove {
    pub card: Card,
    pub position: u8,
    pub outcome: Outcome,
    pub robustness: f64,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edge {
    Top,
    Right,
    Bottom,
    Left,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Neighbor {
    pub position: u8,
    pub attacking_edge: Edge,
    pub defending_edge: Edge,
}

// STUBS — tests will fail until these are properly implemented

pub fn create_card(top: u8, right: u8, bottom: u8, left: u8, card_type: CardType) -> Card {
    let id = NEXT_CARD_ID.with(|c| {
        let current = c.get();
        c.set(current + 1);
        current
    });
    Card { id, top, right, bottom, left, card_type }
}

pub fn reset_card_ids() {
    NEXT_CARD_ID.with(|c| c.set(0));
}

pub fn create_initial_state(
    player_hand: Vec<Card>,
    opponent_hand: Vec<Card>,
    first_turn: Owner,
    rules: RuleSet,
) -> GameState {
    GameState {
        board: [None; 9],
        player_hand,
        opponent_hand,
        current_turn: first_turn,
        rules,
    }
}

pub fn get_score(state: &GameState) -> (usize, usize) {
    let mut player = state.player_hand.len();
    let mut opponent = state.opponent_hand.len();
    for placed in state.board.iter().flatten() {
        match placed.owner {
            Owner::Player => player += 1,
            Owner::Opponent => opponent += 1,
        }
    }
    (player, opponent)
}

// Static adjacency lookup table — each board position maps to its neighbors
// and the edges involved in combat (attacker edge vs defender edge).
// Positions: [0,1,2] = top row, [3,4,5] = middle, [6,7,8] = bottom (row-major)

const ADJ_0: [Neighbor; 2] = [
    Neighbor { position: 1, attacking_edge: Edge::Right,  defending_edge: Edge::Left  },
    Neighbor { position: 3, attacking_edge: Edge::Bottom, defending_edge: Edge::Top   },
];
const ADJ_1: [Neighbor; 3] = [
    Neighbor { position: 0, attacking_edge: Edge::Left,   defending_edge: Edge::Right },
    Neighbor { position: 2, attacking_edge: Edge::Right,  defending_edge: Edge::Left  },
    Neighbor { position: 4, attacking_edge: Edge::Bottom, defending_edge: Edge::Top   },
];
const ADJ_2: [Neighbor; 2] = [
    Neighbor { position: 1, attacking_edge: Edge::Left,   defending_edge: Edge::Right },
    Neighbor { position: 5, attacking_edge: Edge::Bottom, defending_edge: Edge::Top   },
];
const ADJ_3: [Neighbor; 3] = [
    Neighbor { position: 0, attacking_edge: Edge::Top,    defending_edge: Edge::Bottom },
    Neighbor { position: 4, attacking_edge: Edge::Right,  defending_edge: Edge::Left   },
    Neighbor { position: 6, attacking_edge: Edge::Bottom, defending_edge: Edge::Top    },
];
const ADJ_4: [Neighbor; 4] = [
    Neighbor { position: 1, attacking_edge: Edge::Top,    defending_edge: Edge::Bottom },
    Neighbor { position: 3, attacking_edge: Edge::Left,   defending_edge: Edge::Right  },
    Neighbor { position: 5, attacking_edge: Edge::Right,  defending_edge: Edge::Left   },
    Neighbor { position: 7, attacking_edge: Edge::Bottom, defending_edge: Edge::Top    },
];
const ADJ_5: [Neighbor; 3] = [
    Neighbor { position: 2, attacking_edge: Edge::Top,    defending_edge: Edge::Bottom },
    Neighbor { position: 4, attacking_edge: Edge::Left,   defending_edge: Edge::Right  },
    Neighbor { position: 8, attacking_edge: Edge::Bottom, defending_edge: Edge::Top    },
];
const ADJ_6: [Neighbor; 2] = [
    Neighbor { position: 3, attacking_edge: Edge::Top,    defending_edge: Edge::Bottom },
    Neighbor { position: 7, attacking_edge: Edge::Right,  defending_edge: Edge::Left   },
];
const ADJ_7: [Neighbor; 3] = [
    Neighbor { position: 6, attacking_edge: Edge::Left,   defending_edge: Edge::Right  },
    Neighbor { position: 8, attacking_edge: Edge::Right,  defending_edge: Edge::Left   },
    Neighbor { position: 4, attacking_edge: Edge::Top,    defending_edge: Edge::Bottom },
];
const ADJ_8: [Neighbor; 2] = [
    Neighbor { position: 7, attacking_edge: Edge::Left,   defending_edge: Edge::Right  },
    Neighbor { position: 5, attacking_edge: Edge::Top,    defending_edge: Edge::Bottom },
];

pub static ADJACENCY: [&[Neighbor]; 9] = [
    &ADJ_0, &ADJ_1, &ADJ_2,
    &ADJ_3, &ADJ_4, &ADJ_5,
    &ADJ_6, &ADJ_7, &ADJ_8,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_card_sets_fields() {
        reset_card_ids();
        let card = create_card(4, 8, 8, 1, CardType::Primal);
        assert_eq!(card.top, 4);
        assert_eq!(card.right, 8);
        assert_eq!(card.bottom, 8);
        assert_eq!(card.left, 1);
        assert_eq!(card.card_type, CardType::Primal);
    }

    #[test]
    fn test_create_card_id_increments() {
        reset_card_ids();
        let a = create_card(1, 1, 1, 1, CardType::None);
        let b = create_card(2, 2, 2, 2, CardType::None);
        assert_eq!(a.id, 0);
        assert_eq!(b.id, 1);
    }

    #[test]
    fn test_get_score_all_in_hands() {
        reset_card_ids();
        let player_hand = vec![
            create_card(1, 1, 1, 1, CardType::None),
            create_card(2, 2, 2, 2, CardType::None),
        ];
        let opponent_hand = vec![
            create_card(3, 3, 3, 3, CardType::None),
        ];
        let state = create_initial_state(player_hand, opponent_hand, Owner::Player, RuleSet::default());
        let (player, opponent) = get_score(&state);
        assert_eq!(player, 2);
        assert_eq!(opponent, 1);
    }

    #[test]
    fn test_get_score_with_board_cards() {
        reset_card_ids();
        let player_hand = vec![create_card(1, 1, 1, 1, CardType::None)];
        let opponent_hand = vec![create_card(2, 2, 2, 2, CardType::None)];
        let mut state = create_initial_state(player_hand, opponent_hand, Owner::Player, RuleSet::default());
        state.board[0] = Some(PlacedCard {
            card: create_card(3, 3, 3, 3, CardType::None),
            owner: Owner::Player,
        });
        state.board[4] = Some(PlacedCard {
            card: create_card(4, 4, 4, 4, CardType::None),
            owner: Owner::Opponent,
        });
        let (player, opponent) = get_score(&state);
        assert_eq!(player, 2); // 1 in hand + 1 on board
        assert_eq!(opponent, 2); // 1 in hand + 1 on board
    }

    #[test]
    fn test_adjacency_corner_0() {
        // Top-left: right neighbor (1) and bottom neighbor (3)
        assert_eq!(ADJACENCY[0].len(), 2);
        assert_eq!(ADJACENCY[0][0].position, 1);
        assert_eq!(ADJACENCY[0][0].attacking_edge, Edge::Right);
        assert_eq!(ADJACENCY[0][0].defending_edge, Edge::Left);
        assert_eq!(ADJACENCY[0][1].position, 3);
        assert_eq!(ADJACENCY[0][1].attacking_edge, Edge::Bottom);
        assert_eq!(ADJACENCY[0][1].defending_edge, Edge::Top);
    }

    #[test]
    fn test_adjacency_center_4() {
        // Center: all 4 neighbors
        assert_eq!(ADJACENCY[4].len(), 4);
        assert!(ADJACENCY[4].iter().any(|n| n.position == 1 && n.attacking_edge == Edge::Top));
        assert!(ADJACENCY[4].iter().any(|n| n.position == 3 && n.attacking_edge == Edge::Left));
        assert!(ADJACENCY[4].iter().any(|n| n.position == 5 && n.attacking_edge == Edge::Right));
        assert!(ADJACENCY[4].iter().any(|n| n.position == 7 && n.attacking_edge == Edge::Bottom));
    }

    #[test]
    fn test_adjacency_corner_8() {
        // Bottom-right: left neighbor (7) and top neighbor (5)
        assert_eq!(ADJACENCY[8].len(), 2);
        assert!(ADJACENCY[8].iter().any(|n| n.position == 7 && n.attacking_edge == Edge::Left));
        assert!(ADJACENCY[8].iter().any(|n| n.position == 5 && n.attacking_edge == Edge::Top));
    }
}
