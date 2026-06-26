import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { batch: vi.fn() };

  return {
    buildManualProductAliasCorrectionQuery: vi.fn(),
    buildManualProductLocationCorrectionQuery: vi.fn(),
    buildActiveShoppingListQuery: vi.fn(),
    buildProductConceptByIdQuery: vi.fn(),
    buildProductConceptCreateQuery: vi.fn(),
    buildProductConceptListQuery: vi.fn(),
    buildShoppingItemProductResolutionQuery: vi.fn(),
    db,
    getDb: vi.fn(() => db),
    getStoreLayout: vi.fn(),
    productConceptIdByNormalizedName: vi.fn(),
    productLocationIdByStoreAndConcept: vi.fn(),
  };
});

vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/db/repositories/product-corrections", () => ({
  buildManualProductAliasCorrectionQuery:
    mocks.buildManualProductAliasCorrectionQuery,
  buildManualProductLocationCorrectionQuery:
    mocks.buildManualProductLocationCorrectionQuery,
  buildProductConceptByIdQuery: mocks.buildProductConceptByIdQuery,
  buildProductConceptCreateQuery: mocks.buildProductConceptCreateQuery,
  buildProductConceptListQuery: mocks.buildProductConceptListQuery,
  productConceptIdByNormalizedName: mocks.productConceptIdByNormalizedName,
  productLocationIdByStoreAndConcept: mocks.productLocationIdByStoreAndConcept,
}));
vi.mock("@/db/repositories/shopping-lists", () => ({
  buildActiveShoppingListQuery: mocks.buildActiveShoppingListQuery,
  buildShoppingItemProductResolutionQuery:
    mocks.buildShoppingItemProductResolutionQuery,
}));
vi.mock("./store-layout", () => ({ getStoreLayout: mocks.getStoreLayout }));

import {
  applyProductCorrection,
  productCorrectionRequestSchema,
} from "./product-corrections";

const validSectionId = "33333333-3333-4333-8333-333333333333";
const validConceptId = "22222222-2222-4222-8222-222222222222";
const storeId = "11111111-1111-4111-8111-111111111111";
const activeListId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-01-01T00:00:00Z");

const layout = {
  id: storeId,
  name: "Example Market",
  aisles: [
    {
      id: "aisle-1",
      identifier: "2",
      displayName: null,
      displayOrder: 0,
      sections: [
        {
          id: validSectionId,
          label: "Dry goods",
          pathOrder: 1,
          side: "center" as const,
        },
      ],
    },
  ],
};

const productConcept = {
  id: validConceptId,
  canonicalName: "Dried fruit",
  normalizedName: "dried fruit",
  excludedTerms: [],
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const alias = {
  id: "alias-1",
  productConceptId: validConceptId,
  storeId,
  normalizedText: "dried mango",
  scope: "store" as const,
  confidence: 1,
  source: "learned" as const,
  isCorrection: true,
  createdAt: now,
  updatedAt: now,
};

const location = {
  id: "location-1",
  storeId,
  productConceptId: validConceptId,
  aisleSectionId: validSectionId,
  positionWithinSection: null,
  confidence: 1,
  source: "manual" as const,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  mocks.buildManualProductAliasCorrectionQuery.mockReset();
  mocks.buildManualProductLocationCorrectionQuery.mockReset();
  mocks.buildActiveShoppingListQuery.mockReset();
  mocks.buildProductConceptByIdQuery.mockReset();
  mocks.buildProductConceptCreateQuery.mockReset();
  mocks.buildProductConceptListQuery.mockReset();
  mocks.buildShoppingItemProductResolutionQuery.mockReset();
  mocks.db.batch.mockReset();
  mocks.getDb.mockClear();
  mocks.getStoreLayout.mockReset();
  mocks.productConceptIdByNormalizedName.mockReset();
  mocks.productLocationIdByStoreAndConcept.mockReset();

  mocks.buildManualProductAliasCorrectionQuery.mockReturnValue("alias-query");
  mocks.buildManualProductLocationCorrectionQuery.mockReturnValue(
    "location-query",
  );
  mocks.buildProductConceptCreateQuery.mockReturnValue("concept-query");
  mocks.buildActiveShoppingListQuery.mockResolvedValue([{ id: activeListId }]);
  mocks.buildShoppingItemProductResolutionQuery.mockReturnValue("relink-query");
  mocks.getStoreLayout.mockResolvedValue(layout);
  mocks.productConceptIdByNormalizedName.mockReturnValue("concept-id-subquery");
  mocks.productLocationIdByStoreAndConcept.mockReturnValue(
    "location-id-subquery",
  );
});

describe("productCorrectionRequestSchema", () => {
  it("accepts an unresolved phrase with an existing category and section", () => {
    const result = productCorrectionRequestSchema.parse({
      rawText: "Wild Rice",
      productConceptId: validConceptId,
      aisleSectionId: validSectionId,
    });

    expect(result).toEqual({
      rawText: "Wild Rice",
      productConceptId: validConceptId,
      aisleSectionId: validSectionId,
    });
  });

  it("accepts a new category name instead of an existing category id", () => {
    const result = productCorrectionRequestSchema.parse({
      rawText: "dried mango",
      canonicalName: "Dried fruit",
      aisleSectionId: validSectionId,
    });

    expect(result).toMatchObject({
      rawText: "dried mango",
      canonicalName: "Dried fruit",
      aisleSectionId: validSectionId,
    });
  });

  it("requires exactly one category selection mode", () => {
    const missing = productCorrectionRequestSchema.safeParse({
      rawText: "wild rice",
      aisleSectionId: validSectionId,
    });
    const duplicate = productCorrectionRequestSchema.safeParse({
      rawText: "wild rice",
      productConceptId: validConceptId,
      canonicalName: "rice",
      aisleSectionId: validSectionId,
    });

    expect(missing.success).toBe(false);
    expect(duplicate.success).toBe(false);
    if (!missing.success && !duplicate.success) {
      expect(missing.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["productConceptId"] }),
          expect.objectContaining({ path: ["canonicalName"] }),
        ]),
      );
      expect(duplicate.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["productConceptId"] }),
          expect.objectContaining({ path: ["canonicalName"] }),
        ]),
      );
    }
  });
});

describe("applyProductCorrection", () => {
  it("batches new concept creation with alias, location, and active-list relink writes", async () => {
    mocks.db.batch.mockResolvedValue([
      [productConcept],
      [alias],
      [location],
      [{ id: "shopping-item-1" }],
    ]);

    const result = await applyProductCorrection({
      rawText: "Dried Mango",
      canonicalName: "Dried fruit",
      aisleSectionId: validSectionId,
    });

    expect(mocks.buildProductConceptByIdQuery).not.toHaveBeenCalled();
    expect(mocks.productConceptIdByNormalizedName).toHaveBeenCalledWith(
      "dried fruit",
    );
    expect(mocks.db.batch).toHaveBeenCalledWith([
      "concept-query",
      "alias-query",
      "location-query",
      "relink-query",
    ]);
    expect(mocks.buildManualProductAliasCorrectionQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        storeId,
        productConceptId: "concept-id-subquery",
        normalizedText: "dried mango",
      }),
    );
    expect(
      mocks.buildManualProductLocationCorrectionQuery,
    ).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        storeId,
        productConceptId: "concept-id-subquery",
        aisleSectionId: validSectionId,
        positionWithinSection: null,
      }),
    );
    expect(result).toMatchObject({
      normalizedText: "dried mango",
      productConcept: {
        id: validConceptId,
        canonicalName: "Dried fruit",
        normalizedName: "dried fruit",
      },
      alias: {
        id: "alias-1",
        normalizedText: "dried mango",
        source: "learned",
        isCorrection: true,
      },
      location: {
        id: "location-1",
        aisleSectionId: validSectionId,
        positionWithinSection: null,
        source: "manual",
      },
      resolution: {
        state: "matched",
        rawText: "Dried Mango",
        normalizedText: "dried mango",
        productConcept,
        confidence: 1,
        source: "learned-alias",
        location: {
          id: "location-1",
          aisleSectionId: validSectionId,
          positionWithinSection: null,
        },
      },
    });
    expect(mocks.buildActiveShoppingListQuery).toHaveBeenCalledWith(
      mocks.db,
      storeId,
    );
    expect(mocks.buildShoppingItemProductResolutionQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        storeId,
        shoppingListId: activeListId,
        normalizedText: "dried mango",
        productConceptId: "concept-id-subquery",
        resolvedLocationId: "location-id-subquery",
      }),
    );
    expect(mocks.productLocationIdByStoreAndConcept).toHaveBeenCalledWith({
      storeId,
      productConceptId: "concept-id-subquery",
    });
  });

  it("maps FK failures from the batched new-concept write to a correction conflict", async () => {
    mocks.db.batch.mockRejectedValue({ code: "23503" });

    await expect(
      applyProductCorrection({
        rawText: "Dried Mango",
        canonicalName: "Dried fruit",
        aisleSectionId: validSectionId,
      }),
    ).rejects.toMatchObject({
      fieldErrors: {
        form: [
          "The selected category or section no longer exists. Refresh and try again.",
        ],
      },
      status: 409,
    });

    expect(mocks.db.batch).toHaveBeenCalledWith([
      "concept-query",
      "alias-query",
      "location-query",
      "relink-query",
    ]);
  });
});
