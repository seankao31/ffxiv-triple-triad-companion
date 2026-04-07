// ABOUTME: Integration tests that load JSON board fixtures and verify place_card output.
// ABOUTME: Fixtures are shared with TypeScript tests to ensure cross-engine correctness.

use engine_rs::board::{place_card, place_card_mut, undo_place};
use engine_rs::types::{Card, GameState, Owner};
use std::fs;

#[derive(serde::Deserialize)]
struct Fixture {
    name: String,
    state: GameState,
    #[serde(rename = "cardId")]
    card_id: u8,
    position: usize,
    expected: GameState,
}

#[test]
fn test_board_fixtures() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let fixtures_dir = std::path::Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join("tests/fixtures/board");

    let mut count = 0;
    let mut entries: Vec<_> = fs::read_dir(&fixtures_dir)
        .expect("fixtures dir missing")
        .map(|e| e.unwrap())
        .collect();
    entries.sort_by_key(|e| e.path());

    for entry in entries {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let json = fs::read_to_string(&path).unwrap();
        let fixture: Fixture = serde_json::from_str(&json)
            .unwrap_or_else(|e| panic!("Failed to parse {}: {}", path.display(), e));

        let hand = match fixture.state.current_turn {
            Owner::Player => &fixture.state.player_hand,
            Owner::Opponent => &fixture.state.opponent_hand,
        };
        let card: Card = *hand
            .iter()
            .find(|c| c.id == fixture.card_id)
            .unwrap_or_else(|| {
                panic!(
                    "Card id {} not found in hand for fixture '{}'",
                    fixture.card_id, fixture.name
                )
            });

        let result = place_card(&fixture.state, card, fixture.position);
        assert_eq!(result, fixture.expected, "Fixture '{}' failed", fixture.name);
        count += 1;
    }

    assert!(
        count > 0,
        "No fixture files found in {}",
        fixtures_dir.display()
    );
    println!("Passed {} board fixtures", count);
}

#[test]
fn test_board_fixtures_mut_and_undo() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let fixtures_dir = std::path::Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join("tests/fixtures/board");

    let mut count = 0;
    let mut entries: Vec<_> = fs::read_dir(&fixtures_dir)
        .expect("fixtures dir missing")
        .map(|e| e.unwrap())
        .collect();
    entries.sort_by_key(|e| e.path());

    for entry in entries {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let json = fs::read_to_string(&path).unwrap();
        let fixture: Fixture = serde_json::from_str(&json)
            .unwrap_or_else(|e| panic!("Failed to parse {}: {}", path.display(), e));

        let hand = match fixture.state.current_turn {
            Owner::Player => &fixture.state.player_hand,
            Owner::Opponent => &fixture.state.opponent_hand,
        };
        let card: Card = *hand
            .iter()
            .find(|c| c.id == fixture.card_id)
            .unwrap_or_else(|| {
                panic!(
                    "Card id {} not found in hand for fixture '{}'",
                    fixture.card_id, fixture.name
                )
            });

        let original = fixture.state.clone();
        let mut state = fixture.state;

        // place_card_mut must produce the same result as place_card
        let undo = place_card_mut(&mut state, card, fixture.position);
        assert_eq!(
            state, fixture.expected,
            "Fixture '{}': place_card_mut result differs from expected",
            fixture.name
        );

        // undo_place must restore the original state exactly
        undo_place(&mut state, undo);
        assert_eq!(
            state, original,
            "Fixture '{}': undo_place did not restore original state",
            fixture.name
        );

        count += 1;
    }

    assert!(
        count > 0,
        "No fixture files found in {}",
        fixtures_dir.display()
    );
    println!("Passed {} board mut+undo fixtures", count);
}

#[test]
fn get_score_counts_all_cards_in_hand_initially() {
    use engine_rs::types::{CardType, Owner, create_card, create_initial_state, get_score, reset_card_ids, RuleSet};

    reset_card_ids();
    let no_rules = RuleSet {
        plus: false,
        same: false,
        reverse: false,
        fallen_ace: false,
        ascension: false,
        descension: false,
        order: false,
    };
    let p: Vec<engine_rs::types::Card> = (0..5)
        .map(|_| create_card(10, 10, 10, 10, CardType::None))
        .collect();
    let o: Vec<engine_rs::types::Card> = (0..5)
        .map(|_| create_card(1, 1, 1, 1, CardType::None))
        .collect();
    let state = create_initial_state(p, o, Owner::Player, no_rules);

    // Initial: all 5 cards in each hand, no board cards
    assert_eq!(get_score(&state), (5, 5));
}

#[test]
fn get_score_reflects_captures() {
    use engine_rs::types::{CardType, Owner, create_card, create_initial_state, reset_card_ids, RuleSet};

    reset_card_ids();
    let no_rules = RuleSet {
        plus: false,
        same: false,
        reverse: false,
        fallen_ace: false,
        ascension: false,
        descension: false,
        order: false,
    };
    let p: Vec<engine_rs::types::Card> = (0..5)
        .map(|_| create_card(10, 10, 10, 10, CardType::None))
        .collect();
    let o: Vec<engine_rs::types::Card> = (0..5)
        .map(|_| create_card(1, 1, 1, 1, CardType::None))
        .collect();
    let state = create_initial_state(p.clone(), o.clone(), Owner::Player, no_rules);

    // Player places at position 4 (center), no adjacents yet
    let state = place_card(&state, p[0], 4);
    // 4 in hand + 1 on board = 5 player; 5 in hand + 0 board = 5 opponent
    let (player_score, opponent_score) = engine_rs::types::get_score(&state);
    assert_eq!((player_score, opponent_score), (5, 5));

    // Opponent places at position 1 (top, adjacent to player's position 4).
    // Position 1 is below position 4, so they are neighbors.
    // Opponent's card at 1 has stats 1,1,1,1; player's card at 4 has stats 10,10,10,10.
    // Opponent's top edge (1) faces player's bottom edge (10). 1 < 10, no capture.
    let state = place_card(&state, o[0], 1);
    // player: 4 in hand + 1 on board = 5; opponent: 4 in hand + 1 on board = 5
    let (player_score, opponent_score) = engine_rs::types::get_score(&state);
    assert_eq!((player_score, opponent_score), (5, 5));

    // Player places at position 0 (top-left, adjacent to opponent's position 1).
    // Position 0 is to the left of position 1.
    // Position 0's right edge (10) faces position 1's left edge (1). 10 > 1, so player captures.
    let state = place_card(&state, p[1], 0);
    // player: 3 in hand + 3 on board (0, 1 captured, 4) = 6; opponent: 4 in hand + 0 on board = 4
    let (player_score, opponent_score) = engine_rs::types::get_score(&state);
    assert_eq!((player_score, opponent_score), (6, 4));
}
