// ABOUTME: Integration tests that load JSON board fixtures and verify place_card output.
// ABOUTME: Fixtures are shared with TypeScript tests to ensure cross-engine correctness.

use engine_rs::board::place_card;
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
