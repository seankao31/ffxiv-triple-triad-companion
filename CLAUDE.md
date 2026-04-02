## Cross-Engine Alignment

- The TypeScript engine (src/engine/board.ts) and Rust engine (engine-rs/src/board.rs) implement
  identical game logic. Board fixtures (tests/fixtures/board/) are the shared contract.
- When adding or modifying board logic tests in EITHER engine, YOU MUST check whether the scenario
  should be a shared fixture. If it tests placeCard behavior, add it to
  scripts/generate-board-fixtures.ts and regenerate.
- When adding capture rules, stat modifiers, or other board mechanics, both engines must be updated
  and fixture-verified before the work is considered complete.
