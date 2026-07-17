import { describe, expect, it } from "vitest";

import {
  deriveProductCategorizationReviewState,
  formatShoppingItemTitle,
  reconcileProductCategorizationResults,
} from "./product-categorization";

const request = {
  items: [
    { key: "a", submittedText: "2 lbs Chicken" },
    { key: "b", submittedText: "Apples" },
  ],
  concepts: [
    {
      id: "chicken",
      canonicalName: "Chicken",
      normalizedName: "chicken",
      excludedTerms: [],
    },
  ],
};

describe("product categorization reconciliation", () => {
  it("returns results in request order and normalizes optional text", () => {
    const results = reconcileProductCategorizationResults(request, [
      {
        key: "b",
        itemName: " Apples ",
        quantityText: " ",
        confidence: 0.7,
        resolution: {
          kind: "suggested",
          productConceptId: null,
          canonicalName: " Produce ",
        },
      },
      {
        key: "a",
        itemName: "Chicken",
        quantityText: " 2 lbs ",
        confidence: 0.95,
        resolution: {
          kind: "existing",
          productConceptId: "chicken",
          canonicalName: null,
        },
      },
    ]);

    expect(results).toEqual([
      expect.objectContaining({ key: "a", quantityText: "2 lbs" }),
      expect.objectContaining({
        key: "b",
        itemName: "Apples",
        quantityText: null,
        resolution: { kind: "suggested", canonicalName: "Produce" },
      }),
    ]);
  });

  it.each([
    ["missing keys", [request.items[0]], []],
    [
      "duplicate keys",
      request.items,
      [
        {
          key: "a",
          itemName: "Chicken",
          quantityText: null,
          confidence: 1,
          resolution: {
            kind: "existing",
            productConceptId: "chicken",
            canonicalName: null,
          },
        },
        {
          key: "a",
          itemName: "Apples",
          quantityText: null,
          confidence: 1,
          resolution: {
            kind: "existing",
            productConceptId: "chicken",
            canonicalName: null,
          },
        },
      ],
    ],
    [
      "unknown concepts",
      [request.items[0]],
      [
        {
          key: "a",
          itemName: "Chicken",
          quantityText: null,
          confidence: 1,
          resolution: {
            kind: "existing",
            productConceptId: "unknown",
            canonicalName: null,
          },
        },
      ],
    ],
  ])("rejects %s", (_label, items, results) => {
    expect(() =>
      reconcileProductCategorizationResults(
        { ...request, items },
        results as never,
      ),
    ).toThrow();
  });

  it("rejects invalid confidence and blank names", () => {
    expect(() =>
      reconcileProductCategorizationResults(
        { ...request, items: [request.items[0]] },
        [
          {
            key: "a",
            itemName: " ",
            quantityText: null,
            confidence: 2,
            resolution: {
              kind: "existing",
              productConceptId: "chicken",
              canonicalName: null,
            },
          },
        ],
      ),
    ).toThrow("invalid structured result");
  });

  it("uses resolution kind as authoritative for required nullable fields", () => {
    expect(
      reconcileProductCategorizationResults(
        { ...request, items: [request.items[0]] },
        [
          {
            key: "a",
            itemName: "Chicken",
            quantityText: null,
            confidence: 1,
            resolution: {
              kind: "existing",
              productConceptId: "chicken",
              canonicalName: "Chicken",
            },
          },
        ],
      )[0]?.resolution,
    ).toEqual({ kind: "existing", productConceptId: "chicken" });
  });

  it("resolves a suggested name to an existing normalized concept", () => {
    expect(
      reconcileProductCategorizationResults(
        { ...request, items: [request.items[0]] },
        [
          {
            key: "a",
            itemName: "Chicken",
            quantityText: "2 lbs",
            confidence: 0.85,
            resolution: {
              kind: "suggested",
              productConceptId: null,
              canonicalName: " CHICKEN ",
            },
          },
        ],
      )[0],
    ).toMatchObject({
      confidence: 0.85,
      quantityText: "2 lbs",
      resolution: { kind: "existing", productConceptId: "chicken" },
    });
  });
});

describe("product categorization presentation", () => {
  it("derives review states at the confidence threshold", () => {
    expect(
      deriveProductCategorizationReviewState({
        confidence: 0.8,
        source: "llm",
        suggestedConceptName: null,
      }),
    ).toBe("none");
    expect(
      deriveProductCategorizationReviewState({
        confidence: 0.79,
        source: "llm",
        suggestedConceptName: null,
      }),
    ).toBe("low-confidence");
    expect(
      deriveProductCategorizationReviewState({
        confidence: 1,
        source: "llm",
        suggestedConceptName: "Specialty Sauce",
      }),
    ).toBe("suggested-concept");
  });

  it("formats quantity without parsing parentheses", () => {
    expect(formatShoppingItemTitle("Chicken", "2 lbs")).toBe("Chicken (2 lbs)");
    expect(formatShoppingItemTitle("Chicken (boneless)", null)).toBe(
      "Chicken (boneless)",
    );
  });
});
