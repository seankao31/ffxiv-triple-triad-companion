## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for commands, project structure, and build instructions.

## Cross-Engine Alignment

- The TypeScript engine (src/engine/board.ts) and Rust engine (engine-rs/src/board.rs) implement
  identical game logic. Board fixtures (tests/fixtures/board/) are the shared contract.
- When adding or modifying board logic tests in EITHER engine, YOU MUST check whether the scenario
  should be a shared fixture. If it tests placeCard behavior, add it to
  scripts/generate-board-fixtures.ts and regenerate.
- When adding capture rules, stat modifiers, or other board mechanics, both engines must be updated
  and fixture-verified before the work is considered complete.

## Linear

**Initiative:** Triple Triad Companion
**Team:** Engineering

| Project | Scope |
|---------|-------|
| Core Engine | TS + Rust game logic, capture rules, board mechanics, native server |
| PIMC Sampling Consolidation | Migrate sampling from TS to Rust/WASM |
| Deck Optimizer | Hand selection from card pool |
| Solver AI Enhancement | Opponent modeling |
| UI | Interface improvements |
| Post-Game Analysis | Replay/analysis |
