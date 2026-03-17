// ABOUTME: Public API for the Triple Triad Rust engine.
// ABOUTME: Re-exports core types and functions for WASM and native targets.

pub mod types;
pub mod board;
pub mod solver;

use wasm_bindgen::prelude::*;

/// WASM entry point: accepts a JSON-serialized GameState, returns JSON-serialized Vec<RankedMove>.
#[wasm_bindgen]
pub fn wasm_solve(state_json: &str) -> String {
    let state: types::GameState = serde_json::from_str(state_json)
        .expect("wasm_solve: invalid state JSON");
    let moves = solver::find_best_move(&state);
    serde_json::to_string(&moves).expect("wasm_solve: serialization failed")
}
