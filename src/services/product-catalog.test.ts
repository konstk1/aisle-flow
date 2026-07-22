import { describe, expect, it } from "vitest";

import {
  curatedProductConcepts,
  curatedQualifierRules,
} from "./product-catalog";

describe("curated product catalog", () => {
  it("contains the complete normalized production catalog", () => {
    expect(
      curatedProductConcepts.map((concept) => concept.canonicalName),
    ).toEqual([
      "apple sauce",
      "beans",
      "butter",
      "canned vegetables",
      "cereal",
      "cheese",
      "chips",
      "coffee",
      "dairy",
      "deli",
      "fish",
      "frozen breakfast",
      "frozen vegetables",
      "grains",
      "granola",
      "ice cream",
      "juice",
      "meat",
      "nuts",
      "orange juice",
      "pancakes",
      "paper goods",
      "pasta",
      "produce",
      "rice",
      "seasoning",
      "tea",
      "vinegar",
      "water",
      "yogurt",
    ]);
  });

  it("derives every qualifier rule from the produce term set", () => {
    const produce = curatedProductConcepts.find(
      (concept) => concept.canonicalName === "produce",
    );

    expect(produce).toBeDefined();
    for (const rule of curatedQualifierRules) {
      expect(rule.productTerms).toBe(produce?.terms);
    }
  });
});
