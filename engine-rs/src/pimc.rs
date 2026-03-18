// ABOUTME: PIMC sampling logic for server-side Three Open solving.
// ABOUTME: Weighted reservoir sampling with star-tier budget constraints, Rayon-parallel simulation.

use rand::Rng;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::types::{Card, CardType, GameState, Owner, RankedMove};

/// A card from the global card database, used for PIMC world sampling.
/// Sent by the TypeScript client in the solve request body (subset of cards.json).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PIMCCard {
    pub id: Option<u32>,
    pub top: u8,
    pub right: u8,
    pub bottom: u8,
    pub left: u8,
    #[serde(rename = "type")]
    pub card_type: String,
    pub owned: f64,
    pub stars: u8,
    // `name` present in cards.json but unused by solver logic.
    pub name: Option<String>,
}

/// Sampling weight: owned × (top two stats). Separates rarity tiers and rewards power.
fn card_weight(c: &PIMCCard) -> f64 {
    let mut stats = [c.top, c.right, c.bottom, c.left];
    stats.sort_unstable_by(|a, b| b.cmp(a));
    c.owned * (stats[0] as f64 + stats[1] as f64)
}

/// Weighted reservoir sampling (Efraimidis–Spirakis).
/// Returns `count` distinct items from `pool`, sampled without replacement.
pub fn weighted_sample<R: Rng>(pool: &[PIMCCard], count: usize, rng: &mut R) -> Vec<PIMCCard> {
    assert!(count <= pool.len(), "Cannot sample {} from pool of {}", count, pool.len());
    let mut keyed: Vec<(f64, usize)> = pool
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let w = card_weight(c).max(1e-9);
            let r: f64 = rng.gen();
            (r.powf(1.0 / w), i)
        })
        .collect();
    keyed.sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    keyed.into_iter().take(count).map(|(_, i)| pool[i].clone()).collect()
}

/// Sample `count` items respecting FFXIV star-tier deck limits.
/// Partitions pool into three tiers; samples up to `max_five_stars` five-stars,
/// up to `max_four_stars` four-stars, fills remainder from lower-star cards.
/// Returns None if the lower-star tier cannot fill remaining slots.
pub fn weighted_sample_constrained<R: Rng>(
    pool: &[PIMCCard],
    count: usize,
    max_five_stars: u8,
    max_four_stars: u8,
    rng: &mut R,
) -> Option<Vec<PIMCCard>> {
    let five: Vec<PIMCCard> = pool.iter().filter(|c| c.stars == 5).cloned().collect();
    let four: Vec<PIMCCard> = pool.iter().filter(|c| c.stars == 4).cloned().collect();
    let other: Vec<PIMCCard> = pool.iter().filter(|c| c.stars < 4).cloned().collect();

    let n_five = (max_five_stars as usize).min(five.len()).min(count);
    let n_four = (max_four_stars as usize).min(four.len()).min(count - n_five);
    let n_other = count.checked_sub(n_five + n_four)?;

    if other.len() < n_other {
        return None;
    }

    let mut result = Vec::with_capacity(count);
    if n_five > 0 {
        result.extend(weighted_sample(&five, n_five, rng));
    }
    if n_four > 0 {
        result.extend(weighted_sample(&four, n_four, rng));
    }
    if n_other > 0 {
        result.extend(weighted_sample(&other, n_other, rng));
    }

    // Shuffle to remove positional bias introduced by tier ordering.
    for i in (1..result.len()).rev() {
        let j = rng.gen_range(0..=i);
        result.swap(i, j);
    }
    Some(result)
}

fn pimc_card_type(s: &str) -> CardType {
    match s {
        "primal" => CardType::Primal,
        "scion" => CardType::Scion,
        "society" => CardType::Society,
        "garlean" => CardType::Garlean,
        _ => CardType::None,
    }
}

/// Run PIMC: for each simulation, sample replacement cards for unknown slots,
/// run minimax on the fully-resolved world, record the top move.
/// Aggregates results as confidence = fraction of simulations where each move was best.
///
/// `unknown_ids`: game-session IDs of placeholder cards in `state.opponent_hand`.
/// `pool`: pre-filtered candidate cards sent by the TypeScript client.
/// `max_five_stars` / `max_four_stars`: remaining star budget (computed by the client).
pub fn run_pimc(
    state: &GameState,
    unknown_ids: &[u8],
    pool: &[PIMCCard],
    max_five_stars: u8,
    max_four_stars: u8,
    sim_count: usize,
) -> Vec<RankedMove> {
    if unknown_ids.is_empty() || pool.len() < unknown_ids.len() {
        return crate::solver::find_best_move(state);
    }

    let sim_results: Vec<Option<RankedMove>> = (0..sim_count)
        .into_par_iter()
        .map(|_| {
            let mut rng = rand::thread_rng();
            let sampled =
                weighted_sample_constrained(pool, unknown_ids.len(), max_five_stars, max_four_stars, &mut rng)
                    .unwrap_or_else(|| weighted_sample(pool, unknown_ids.len(), &mut rng));

            // Replace each placeholder card (matched by game-session ID) with sampled stats.
            let new_opponent_hand: Vec<Card> = state
                .opponent_hand
                .iter()
                .map(|c| {
                    if let Some(pos) = unknown_ids.iter().position(|&id| id == c.id) {
                        let s = &sampled[pos];
                        Card {
                            id: c.id,
                            top: s.top,
                            right: s.right,
                            bottom: s.bottom,
                            left: s.left,
                            card_type: pimc_card_type(&s.card_type),
                        }
                    } else {
                        *c
                    }
                })
                .collect();

            let sim_state = GameState { opponent_hand: new_opponent_hand, ..state.clone() };
            let moves = crate::solver::find_best_move(&sim_state);
            let top = moves.into_iter().next()?;

            // Map top move back to the original state's card (same ID, original placeholder stats).
            let original_card = if state.current_turn == Owner::Player {
                state.player_hand.iter().find(|c| c.id == top.card.id).copied()
            } else {
                state.opponent_hand.iter().find(|c| c.id == top.card.id).copied()
            };
            Some(RankedMove { card: original_card.unwrap_or(top.card), ..top })
        })
        .collect();

    // Tally by (card_id, position): keep first-seen RankedMove, count occurrences.
    let mut tally: HashMap<(u8, u8), (RankedMove, usize)> = HashMap::new();
    for ranked_move in sim_results.into_iter().flatten() {
        let key = (ranked_move.card.id, ranked_move.position);
        tally
            .entry(key)
            .and_modify(|(_, cnt)| *cnt += 1)
            .or_insert((ranked_move, 1));
    }

    let total = sim_count as f64;
    let mut results: Vec<RankedMove> = tally
        .into_values()
        .map(|(mut m, count)| {
            m.confidence = Some(count as f64 / total);
            m
        })
        .collect();

    results.sort_by(|a, b| {
        b.confidence
            .unwrap_or(0.0)
            .partial_cmp(&a.confidence.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CardType, GameState, Owner, PlacedCard, RuleSet};
    use rand::rngs::SmallRng;
    use rand::SeedableRng;
    use std::collections::HashSet;

    fn pimc_card(stars: u8, stat: u8) -> PIMCCard {
        PIMCCard {
            id: None,
            top: stat,
            right: stat,
            bottom: stat,
            left: stat,
            card_type: "none".to_string(),
            owned: 1.0,
            stars,
            name: None,
        }
    }

    fn game_card(id: u8, val: u8) -> Card {
        Card { id, top: val, right: val, bottom: val, left: val, card_type: CardType::None }
    }

    /// State with 7 cells filled, 2 empty. Opponent's turn; card ID 8 is the unknown.
    fn state_with_one_unknown() -> GameState {
        let mut board = [None; 9];
        board[0] = Some(PlacedCard { card: game_card(0, 5), owner: Owner::Player });
        board[1] = Some(PlacedCard { card: game_card(1, 5), owner: Owner::Opponent });
        board[2] = Some(PlacedCard { card: game_card(2, 5), owner: Owner::Player });
        board[3] = Some(PlacedCard { card: game_card(3, 5), owner: Owner::Opponent });
        board[4] = Some(PlacedCard { card: game_card(4, 5), owner: Owner::Player });
        board[5] = Some(PlacedCard { card: game_card(5, 5), owner: Owner::Opponent });
        board[6] = Some(PlacedCard { card: game_card(6, 5), owner: Owner::Player });
        GameState {
            board,
            player_hand: vec![game_card(9, 5)],
            opponent_hand: vec![game_card(7, 8), game_card(8, 1)],
            current_turn: Owner::Opponent,
            rules: RuleSet::default(),
        }
    }

    #[test]
    fn weighted_sample_returns_correct_count() {
        let pool: Vec<PIMCCard> = (0..10).map(|i| pimc_card(3, i + 1)).collect();
        let mut rng = SmallRng::seed_from_u64(42);
        let sampled = weighted_sample(&pool, 3, &mut rng);
        assert_eq!(sampled.len(), 3);
    }

    #[test]
    fn weighted_sample_no_duplicate_indices() {
        // Give each card a unique id to verify sampling without replacement.
        let pool: Vec<PIMCCard> = (0..10u32)
            .map(|i| PIMCCard { id: Some(i), ..pimc_card(3, i as u8 + 1) })
            .collect();
        let mut rng = SmallRng::seed_from_u64(42);
        let sampled = weighted_sample(&pool, 5, &mut rng);
        let ids: HashSet<Option<u32>> = sampled.iter().map(|c| c.id).collect();
        assert_eq!(ids.len(), 5, "should have 5 distinct cards");
    }

    #[test]
    fn weighted_sample_constrained_respects_tier_caps() {
        let mut pool: Vec<PIMCCard> = vec![pimc_card(5, 10), pimc_card(4, 8), pimc_card(4, 7)];
        for _ in 0..10 {
            pool.push(pimc_card(3, 5));
        }
        let mut rng = SmallRng::seed_from_u64(42);
        let sampled = weighted_sample_constrained(&pool, 3, 1, 1, &mut rng).unwrap();
        assert_eq!(sampled.len(), 3);
        assert!(sampled.iter().filter(|c| c.stars == 5).count() <= 1);
        assert!(sampled.iter().filter(|c| c.stars == 4).count() <= 1);
    }

    #[test]
    fn weighted_sample_constrained_returns_none_when_lower_tier_insufficient() {
        // Pool has only 5-star and 4-star cards; sampling 5 cards with (max 1 five, 1 four)
        // would need 3 from <4 tier, but there are none.
        let pool = vec![pimc_card(5, 10), pimc_card(4, 8), pimc_card(4, 7)];
        let mut rng = SmallRng::seed_from_u64(42);
        let result = weighted_sample_constrained(&pool, 5, 1, 1, &mut rng);
        assert!(result.is_none());
    }

    #[test]
    fn run_pimc_returns_ranked_moves_with_confidence() {
        let state = state_with_one_unknown();
        let pool: Vec<PIMCCard> =
            (0..20u32).map(|i| PIMCCard { id: Some(100 + i), ..pimc_card(3, 5) }).collect();
        let unknown_ids = [8u8];
        let results = run_pimc(&state, &unknown_ids, &pool, 1, 2, 10);
        assert!(!results.is_empty(), "should return at least one ranked move");
        for m in &results {
            assert!(m.confidence.is_some(), "each move should have a confidence value");
        }
    }

    #[test]
    fn run_pimc_confidence_sums_to_at_most_one() {
        let state = state_with_one_unknown();
        let pool: Vec<PIMCCard> =
            (0..20u32).map(|i| PIMCCard { id: Some(100 + i), ..pimc_card(3, 5) }).collect();
        let results = run_pimc(&state, &[8u8], &pool, 1, 2, 20);
        let total: f64 = results.iter().map(|m| m.confidence.unwrap_or(0.0)).sum();
        assert!(total <= 1.0 + 1e-9, "confidence total should be ≤ 1.0, got {total}");
    }

    #[test]
    fn run_pimc_with_no_unknowns_falls_back_to_minimax() {
        let state = state_with_one_unknown();
        let results = run_pimc(&state, &[], &[], 1, 2, 10);
        assert!(!results.is_empty(), "fallback minimax should return moves");
    }
}
