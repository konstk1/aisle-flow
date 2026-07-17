import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductCategorizationRequest } from "@/domain/product-categorization";

const mocks = vi.hoisted(() => ({
  buildExactProductAliasesLookupQuery: vi.fn(),
  createStoreProductMatcher: vi.fn(),
  loadProductConceptCatalog: vi.fn(),
  resolveProductMatch: vi.fn(),
}));

vi.mock("@/db/repositories/shopping-lists", () => ({
  buildExactProductAliasesLookupQuery:
    mocks.buildExactProductAliasesLookupQuery,
}));
vi.mock("./product-concept-catalog", () => ({
  loadProductConceptCatalog: mocks.loadProductConceptCatalog,
}));
vi.mock("./product-matching", () => ({
  createStoreProductMatcher: mocks.createStoreProductMatcher,
}));

import {
  categorizeSubmittedProducts,
  ProductCategorizationUnavailableError,
} from "./product-categorization";

const concepts = [
  {
    id: "apples",
    canonicalName: "Apples",
    normalizedName: "apples",
    excludedTerms: [],
  },
];

describe("submitted product categorization", () => {
  beforeEach(() => {
    mocks.buildExactProductAliasesLookupQuery.mockReset();
    mocks.createStoreProductMatcher.mockReset();
    mocks.loadProductConceptCatalog.mockReset();
    mocks.resolveProductMatch.mockReset();
    mocks.buildExactProductAliasesLookupQuery.mockResolvedValue([]);
    mocks.loadProductConceptCatalog.mockResolvedValue(concepts);
    mocks.createStoreProductMatcher.mockResolvedValue(
      mocks.resolveProductMatch,
    );
  });

  it("keeps exact aliases authoritative and batches only unresolved items", async () => {
    mocks.buildExactProductAliasesLookupQuery.mockResolvedValue([
      {
        alias: { normalizedText: "my apples", confidence: 1 },
        productConcept: { id: "apples" },
      },
    ]);
    const categorizeWithAi = vi.fn(
      async (request: ProductCategorizationRequest) => ({
        results: request.items.map((item) => ({
          key: item.key,
          itemName: "Bananas",
          quantityText: "3",
          confidence: 0.7,
          resolution: {
            kind: "suggested" as const,
            canonicalName: "Bananas",
          },
        })),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    );

    const results = await categorizeSubmittedProducts({
      categorizeWithAi,
      db: {} as never,
      items: [
        { key: "a", submittedText: "My Apples" },
        { key: "b", submittedText: "Bananas 3" },
      ],
      mode: "ai",
      storeId: null,
      userId: "user-a",
    });

    expect(categorizeWithAi).toHaveBeenCalledWith({
      concepts,
      items: [{ key: "b", submittedText: "Bananas 3" }],
    });
    expect(results).toEqual([
      expect.objectContaining({
        key: "a",
        productConceptId: "apples",
        source: "learned-alias",
      }),
      expect.objectContaining({
        key: "b",
        quantityText: "3",
        source: "llm",
        suggestedProductConceptName: "Bananas",
      }),
    ]);
  });

  it("uses the existing deterministic matcher without AI", async () => {
    mocks.resolveProductMatch.mockResolvedValue({
      state: "needs-user-correction",
      confidence: 0,
      source: "unresolved",
    });
    const categorizeWithAi = vi.fn();

    const [result] = await categorizeSubmittedProducts({
      categorizeWithAi,
      db: {} as never,
      items: [{ key: "a", submittedText: "Chicken (2 lbs)" }],
      mode: "deterministic",
      storeId: null,
      userId: "user-a",
    });

    expect(result).toMatchObject({
      itemName: "Chicken (2 lbs)",
      quantityText: null,
      source: "deterministic",
    });
    expect(categorizeWithAi).not.toHaveBeenCalled();
    expect(mocks.loadProductConceptCatalog).not.toHaveBeenCalled();
  });

  it("converts provider failures to the retryable application error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      categorizeSubmittedProducts({
        categorizeWithAi: vi.fn().mockRejectedValue(new Error("offline")),
        db: {} as never,
        items: [{ key: "a", submittedText: "Apples" }],
        mode: "ai",
        storeId: null,
        userId: "user-a",
      }),
    ).rejects.toBeInstanceOf(ProductCategorizationUnavailableError);
  });
});
