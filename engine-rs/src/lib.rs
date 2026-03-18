// ABOUTME: Public API for the Triple Triad Rust engine.
// ABOUTME: Re-exports core types and functions for WASM and native targets.

pub mod types;
pub mod board;
pub mod solver;
#[cfg(feature = "server")]
pub mod pimc;

use wasm_bindgen::prelude::*;

/// WASM entry point: accepts a JSON-serialized GameState, returns JSON-serialized Vec<RankedMove>.
#[wasm_bindgen]
pub fn wasm_solve(state_json: &str) -> String {
    let state: types::GameState = serde_json::from_str(state_json)
        .expect("wasm_solve: invalid state JSON");
    let moves = solver::find_best_move(&state);
    serde_json::to_string(&moves).expect("wasm_solve: serialization failed")
}

/// WASM PIMC entry point: accepts a JSON-serialized fully-resolved GameState,
/// runs one minimax simulation with a fresh TT, returns the top RankedMove as JSON (or "null").
#[wasm_bindgen]
pub fn wasm_simulate(state_json: &str) -> String {
    let state: types::GameState = serde_json::from_str(state_json)
        .expect("wasm_simulate: invalid state JSON");
    let moves = solver::find_best_move(&state);  // fresh TT per call
    let top = moves.into_iter().next();
    serde_json::to_string(&top).expect("wasm_simulate: serialization failed")
}
