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

  it("rejects blank names", () => {
    expect(() =>
      reconcileProductCategorizationResults(
        { ...request, items: [request.items[0]] },
        [
          {
            key: "a",
            itemName: " ",
            quantityText: null,
            resolution: {
              kind: "existing",
              productConceptId: "chicken",
              canonicalName: null,
            },
          },
        ],
      ),
    ).toThrow("blank item name");
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
            resolution: {
              kind: "suggested",
              productConceptId: null,
              canonicalName: " CHICKEN ",
            },
          },
        ],
      )[0],
    ).toMatchObject({
      quantityText: "2 lbs",
      resolution: { kind: "existing", productConceptId: "chicken" },
    });
  });
});

describe("product categorization presentation", () => {
  it("requires review only for suggested concepts", () => {
    expect(
      deriveProductCategorizationReviewState({
        suggestedConceptName: null,
      }),
    ).toBe("none");
    expect(
      deriveProductCategorizationReviewState({
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
