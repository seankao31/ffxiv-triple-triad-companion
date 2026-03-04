// ABOUTME: Tests for the card data transformation logic used by the scraper.
// ABOUTME: Validates type mapping and API-to-internal format conversion.

import { describe, expect, test } from "bun:test";
import { mapType, transformCard } from "../../scripts/scrape-cards";
import type { FFXIVCollectCard } from "../../scripts/scrape-cards";

describe("mapType", () => {
  test("maps known types to lowercase values", () => {
    expect(mapType("Primal")).toBe("primal");
    expect(mapType("Scion")).toBe("scion");
    expect(mapType("Society")).toBe("society");
    expect(mapType("Garlean")).toBe("garlean");
  });

  test("maps unknown types to 'none'", () => {
    expect(mapType("None")).toBe("none");
    expect(mapType("")).toBe("none");
    expect(mapType("Something Else")).toBe("none");
  });
});

describe("transformCard", () => {
  test("transforms API card data to internal format", () => {
    const apiCard: FFXIVCollectCard = {
      id: 1,
      name: "Dodo",
      stars: 1,
      stats: {
        numeric: { top: 4, right: 2, bottom: 3, left: 2 },
      },
      type: { id: 0, name: "None" },
      owned: "42.3%",
    };

    expect(transformCard(apiCard)).toEqual({
      id: 1,
      name: "Dodo",
      top: 4,
      right: 2,
      bottom: 3,
      left: 2,
      type: "none",
      stars: 1,
      owned: 42.3,
    });
  });

  test("parses owned percentage correctly", () => {
    const apiCard: FFXIVCollectCard = {
      id: 2,
      name: "Tonberry",
      stars: 2,
      stats: {
        numeric: { top: 7, right: 2, bottom: 2, left: 7 },
      },
      type: { id: 1, name: "Primal" },
      owned: "0%",
    };

    expect(transformCard(apiCard).owned).toBe(0);
  });

  test("handles missing percentage gracefully", () => {
    const apiCard: FFXIVCollectCard = {
      id: 3,
      name: "Test",
      stars: 1,
      stats: {
        numeric: { top: 1, right: 1, bottom: 1, left: 1 },
      },
      type: { id: 0, name: "None" },
      owned: "",
    };

    expect(transformCard(apiCard).owned).toBe(0);
  });
});
