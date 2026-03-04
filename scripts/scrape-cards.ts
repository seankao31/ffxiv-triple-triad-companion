// ABOUTME: One-off script to fetch Triple Triad card data from ffxivcollect.com API.
// ABOUTME: Outputs src/data/cards.json with normalized card stats.

const API_URL = "https://ffxivcollect.com/api/triad/cards";

export interface FFXIVCollectCard {
  id: number;
  name: string;
  stars: number;
  stats: {
    numeric: { top: number; right: number; bottom: number; left: number };
  };
  type: { id: number; name: string };
  owned: string;
}

export interface CardData {
  id: number;
  name: string;
  top: number;
  right: number;
  bottom: number;
  left: number;
  type: "primal" | "scion" | "society" | "garlean" | "none";
  stars: number;
  owned: number;
}

export function mapType(typeName: string): CardData["type"] {
  const lower = typeName.toLowerCase();
  if (lower === "primal") return "primal";
  if (lower === "scion") return "scion";
  if (lower === "society") return "society";
  if (lower === "garlean") return "garlean";
  return "none";
}

export function transformCard(card: FFXIVCollectCard): CardData {
  return {
    id: card.id,
    name: card.name,
    top: card.stats.numeric.top,
    right: card.stats.numeric.right,
    bottom: card.stats.numeric.bottom,
    left: card.stats.numeric.left,
    type: mapType(card.type.name),
    stars: card.stars,
    owned: parseFloat(card.owned.replace("%", "")) || 0,
  };
}

async function main() {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const cards: CardData[] = data.results.map((card: FFXIVCollectCard) =>
    transformCard(card)
  );

  await Bun.write("src/data/cards.json", JSON.stringify(cards, null, 2));
  console.log(`Wrote ${cards.length} cards to src/data/cards.json`);
}

// Only run main when executed directly, not when imported by tests
if (import.meta.main) {
  main();
}
