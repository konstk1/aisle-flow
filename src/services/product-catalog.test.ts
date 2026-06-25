import { describe, expect, it } from "vitest";

import {
  curatedProductConcepts,
  curatedQualifierRules,
} from "./product-catalog";

describe("curated product catalog", () => {
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
