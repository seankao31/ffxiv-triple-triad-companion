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

## Testing: visual and e2e

New pages, routes, and visual changes must include:

- **Playwright e2e tests** following the existing pattern in `tests/e2e/`. Mock external APIs to keep tests offline.
- **Visual verification via Playwright** (navigate + screenshot) before declaring work complete.

Unit tests alone are not sufficient for UI work.

## Git workflow

- **Rebase before merge.** When integrating a feature branch into main, rebase the branch onto main first so the merge is a fast-forward. Keep history linear.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`

**Scopes** are coarse, stable, and map to architectural boundaries — not features or tickets:

| Scope | Area |
|-------|------|
| `engine` | `src/engine/` — TS game logic, shared fixtures |
| `engine-rs` | `engine-rs/` — Rust engine |
| `solver` | Solver-specific logic (TS or Rust) |
| `ui` | `src/app/` — Svelte components, store |
| `e2e` | `tests/e2e/` — Playwright tests |
| `wasm` | WASM build/integration |
| _(omit)_ | Docs-only, config, or multi-area changes |

**Linear ticket references** go in a `Ref:` trailer, not in the scope or subject:

```
feat(ui): add side radio picker to SetupView

Ref: ENG-85
```
