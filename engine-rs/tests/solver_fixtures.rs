// ABOUTME: Integration tests that load JSON solver fixtures and verify find_best_move output.
// ABOUTME: Fixtures are shared with TypeScript tests to ensure cross-engine correctness.

use engine_rs::solver::find_best_move;
use engine_rs::types::GameState;
use std::fs;

#[derive(serde::Deserialize)]
struct ExpectedMove {
    #[serde(rename = "cardId")]
    card_id: u8,
    position: u8,
    score: u8,
    robustness: f64,
}

#[derive(serde::Deserialize)]
struct Fixture {
    name: String,
    state: GameState,
    expected: Vec<ExpectedMove>,
}

#[test]
fn test_solver_fixtures() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let fixtures_dir = std::path::Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join("tests/fixtures/solver");

    let mut count = 0;
    let mut entries: Vec<_> = fs::read_dir(&fixtures_dir)
        .expect("solver fixtures dir missing")
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

        let result = find_best_move(&fixture.state);

        assert_eq!(
            result.len(),
            fixture.expected.len(),
            "Fixture '{}': expected {} moves, got {}",
            fixture.name,
            fixture.expected.len(),
            result.len()
        );

        for (i, (got, exp)) in result.iter().zip(fixture.expected.iter()).enumerate() {
            assert_eq!(
                got.card.id, exp.card_id,
                "Fixture '{}' move {i}: card id mismatch (got {}, expected {})",
                fixture.name, got.card.id, exp.card_id
            );
            assert_eq!(
                got.position, exp.position,
                "Fixture '{}' move {i}: position mismatch (got {}, expected {})",
                fixture.name, got.position, exp.position
            );
            assert_eq!(
                got.score, exp.score,
                "Fixture '{}' move {i}: score mismatch (got {}, expected {})",
                fixture.name, got.score, exp.score
            );
            assert!(
                (got.robustness - exp.robustness).abs() < 1e-9,
                "Fixture '{}' move {i}: robustness mismatch (got {}, expected {})",
                fixture.name,
                got.robustness,
                exp.robustness
            );
        }

        count += 1;
    }

    assert!(count > 0, "No solver fixture files found in {}", fixtures_dir.display());
    println!("Passed {count} solver fixtures");
}
