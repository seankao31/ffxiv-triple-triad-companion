# Project Triad

A real-time move optimizer for FFXIV Triple Triad — think "Stockfish for card games." Enter your hand and your opponent's cards, toggle the active rules, and get optimal move suggestions as you play.

## Features

- **Full rule support** — Plus, Same, Reverse, Fallen Ace, Ascension, Descension, and Combo cascades
- **Real-time solver** — Rust/WASM negamax engine runs entirely in-browser, no server required
- **Three Open mode** — handles up to 2 unknown opponent cards via Monte Carlo sampling (PIMC) across 4 parallel WASM workers
- **Swap rule** — supports the Swap regional rule where players exchange a card before play begins
- **Move rankings** — moves ranked by outcome (Win > Draw > Loss) with robustness tie-breaking
- **Undo support** — step back through the game to explore alternative lines
- **Optional native server** — faster PIMC via multi-threaded Rust server for power users

## Screenshots

<!-- TODO: Add screenshot of the setup screen (card entry + rule selection) -->

<!-- TODO: Add screenshot of the game board with solver suggestions visible -->

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) and the [Rust toolchain](https://rustup.rs/) with `cargo install wasm-pack`.

```bash
# Clone and install
git clone git@github.com:seankao31/ffxiv-triple-triad-companion.git && cd ffxiv-triple-triad-companion
bun install

# Build the WASM solver (required once, and after engine changes)
cd engine-rs && wasm-pack build --target web --out-dir ../pkg && cd ..

# Start the dev server
bun run dev
```

Open [localhost:5173](http://localhost:5173). Enter both hands, pick your rules, and hit Play.

<!-- TODO: Add a short GIF or screenshot showing the setup → play flow -->

## How It Works

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Svelte 5   │────▶│  WASM Workers    │────▶│  Rust Negamax   │
│   Frontend   │◀────│  (4 parallel)    │◀────│  + Alpha-Beta   │
└──────────────┘     └──────────────────┘     └─────────────────┘
```

1. **Setup** — enter both players' cards (by name or stats), select active rules
2. **Play** — place cards on the 3×3 board; the solver evaluates every legal move in the background
3. **Solver** — Rust negamax with alpha-beta pruning and a 4M-entry transposition table, compiled to WASM
4. **Incomplete information** — when opponent cards are unknown, Perfect Information Monte Carlo (PIMC) sampling runs 50 simulated games across 4 workers to estimate move quality

## Tech Stack

| Concern | Tool |
|---------|------|
| Runtime | Bun |
| Languages | TypeScript + Rust |
| UI | Svelte 5 + Tailwind CSS v4 |
| Solver | Rust → WASM (via wasm-pack) |
| Bundler | Vite |

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full development guide — project structure, test commands, cross-engine alignment, and the optional native solver server.
