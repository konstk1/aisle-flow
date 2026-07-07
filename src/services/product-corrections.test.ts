import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { batch: vi.fn() };

  return {
    buildLearnedAliasByIdQuery: vi.fn(),
    buildLearnedAliasDeleteQuery: vi.fn(),
    buildLearnedAliasListQuery: vi.fn(),
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
  };
});

vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/db/repositories/product-corrections", () => ({
  buildLearnedAliasByIdQuery: mocks.buildLearnedAliasByIdQuery,
  buildLearnedAliasDeleteQuery: mocks.buildLearnedAliasDeleteQuery,
  buildLearnedAliasListQuery: mocks.buildLearnedAliasListQuery,
  buildManualProductAliasCorrectionQuery:
    mocks.buildManualProductAliasCorrectionQuery,
  buildManualProductLocationCorrectionQuery:
    mocks.buildManualProductLocationCorrectionQuery,
  buildProductConceptByIdQuery: mocks.buildProductConceptByIdQuery,
  buildProductConceptCreateQuery: mocks.buildProductConceptCreateQuery,
  buildProductConceptListQuery: mocks.buildProductConceptListQuery,
  productConceptIdByNormalizedName: mocks.productConceptIdByNormalizedName,
}));
vi.mock("@/db/repositories/shopping-lists", () => ({
  buildActiveShoppingListQuery: mocks.buildActiveShoppingListQuery,
  buildShoppingItemProductResolutionQuery:
    mocks.buildShoppingItemProductResolutionQuery,
}));
vi.mock("./store-layout", () => ({
  getCurrentStoreLayout: mocks.getStoreLayout,
}));

import {
  applyProductCorrection,
  deleteLearnedProduct,
  getLearnedProducts,
  getProductCorrectionOptions,
  learnedProductUpdateRequestSchema,
  productCorrectionRequestSchema,
  updateLearnedProduct,
} from "./product-corrections";

const validSectionId = "33333333-3333-4333-8333-333333333333";
const validConceptId = "22222222-2222-4222-8222-222222222222";
const storeId = "11111111-1111-4111-8111-111111111111";
const activeListId = "44444444-4444-4444-8444-444444444444";
const userId = "user-a";
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
  userId,
  normalizedText: "dried mango",
  scope: "user" as const,
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
  mocks.buildLearnedAliasByIdQuery.mockReset();
  mocks.buildLearnedAliasDeleteQuery.mockReset();
  mocks.buildLearnedAliasListQuery.mockReset();
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

  mocks.buildLearnedAliasListQuery.mockResolvedValue([]);
  mocks.buildManualProductAliasCorrectionQuery.mockReturnValue("alias-query");
  mocks.buildManualProductLocationCorrectionQuery.mockReturnValue(
    "location-query",
  );
  mocks.buildProductConceptCreateQuery.mockReturnValue("concept-query");
  mocks.buildActiveShoppingListQuery.mockResolvedValue([{ id: activeListId }]);
  mocks.buildShoppingItemProductResolutionQuery.mockReturnValue("relink-query");
  mocks.getStoreLayout.mockResolvedValue(layout);
  mocks.productConceptIdByNormalizedName.mockReturnValue("concept-id-subquery");
});

describe("productCorrectionRequestSchema", () => {
  it("accepts an unresolved phrase with an existing product and section", () => {
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

  it("accepts a new product name instead of an existing product id", () => {
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

  it("requires exactly one product selection mode", () => {
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

describe("getProductCorrectionOptions", () => {
  it("returns concepts with their learned location in the current store", async () => {
    mocks.buildProductConceptListQuery.mockResolvedValue([
      { productConcept, aisleSectionId: validSectionId },
      {
        productConcept: { ...productConcept, id: "concept-2" },
        aisleSectionId: null,
      },
    ]);

    const options = await getProductCorrectionOptions(userId);

    expect(mocks.buildProductConceptListQuery).toHaveBeenCalledWith(
      mocks.db,
      storeId,
    );
    expect(options.store).toEqual({ id: storeId, name: "Example Market" });
    expect(options.productConcepts).toEqual([
      {
        id: validConceptId,
        canonicalName: "Dried fruit",
        normalizedName: "dried fruit",
        aisleSectionId: validSectionId,
      },
      {
        id: "concept-2",
        canonicalName: "Dried fruit",
        normalizedName: "dried fruit",
        aisleSectionId: null,
      },
    ]);
    expect(options.aisleSections).toHaveLength(1);
  });

  it("queries without a store when the user has no layout", async () => {
    mocks.getStoreLayout.mockResolvedValue(null);
    mocks.buildProductConceptListQuery.mockResolvedValue([]);

    const options = await getProductCorrectionOptions(userId);

    expect(mocks.buildProductConceptListQuery).toHaveBeenCalledWith(
      mocks.db,
      null,
    );
    expect(options).toEqual({
      store: null,
      productConcepts: [],
      aisleSections: [],
    });
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

    const result = await applyProductCorrection(userId, {
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
        userId,
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
      userId,
    );
    expect(mocks.buildShoppingItemProductResolutionQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        shoppingListId: activeListId,
        normalizedText: "dried mango",
        productConceptId: "concept-id-subquery",
      }),
    );
  });

  it("maps FK failures from the batched new-concept write to a correction conflict", async () => {
    mocks.db.batch.mockRejectedValue({ code: "23503" });

    await expect(
      applyProductCorrection(userId, {
        rawText: "Dried Mango",
        canonicalName: "Dried fruit",
        aisleSectionId: validSectionId,
      }),
    ).rejects.toMatchObject({
      fieldErrors: {
        form: [
          "The selected product or section no longer exists. Refresh and try again.",
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

  it("batches the alias and location for an existing product concept", async () => {
    mocks.buildProductConceptByIdQuery.mockResolvedValue([productConcept]);
    mocks.db.batch.mockResolvedValue([
      [alias],
      [location],
      [{ id: "shopping-item-1" }],
    ]);

    await applyProductCorrection(userId, {
      rawText: "Dried Mango",
      productConceptId: validConceptId,
      aisleSectionId: validSectionId,
    });

    expect(mocks.db.batch).toHaveBeenCalledWith([
      "alias-query",
      "location-query",
      "relink-query",
    ]);
    expect(mocks.buildManualProductAliasCorrectionQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        userId,
        productConceptId: validConceptId,
        normalizedText: "dried mango",
      }),
    );
  });
});

describe("learnedProductUpdateRequestSchema", () => {
  it("requires exactly one product selection mode", () => {
    const missing = learnedProductUpdateRequestSchema.safeParse({
      aisleSectionId: validSectionId,
    });
    const valid = learnedProductUpdateRequestSchema.safeParse({
      productConceptId: validConceptId,
      aisleSectionId: validSectionId,
    });

    expect(missing.success).toBe(false);
    expect(valid.success).toBe(true);
  });
});

describe("getLearnedProducts", () => {
  it("lists the user's aliases without locations when no store layout exists", async () => {
    mocks.getStoreLayout.mockResolvedValue(null);

    await expect(getLearnedProducts(userId)).resolves.toEqual({
      store: null,
      learnedProducts: [],
    });
    expect(mocks.buildLearnedAliasListQuery).toHaveBeenCalledWith(
      mocks.db,
      userId,
      null,
    );
  });

  it("joins learned aliases with their store location", async () => {
    mocks.buildLearnedAliasListQuery.mockResolvedValue([
      {
        alias,
        productConcept,
        location,
        aisleSection: {
          id: validSectionId,
          label: "Dry goods",
          pathOrder: 1,
        },
        aisle: { identifier: "2", displayName: null },
      },
    ]);

    const payload = await getLearnedProducts(userId);

    expect(mocks.buildLearnedAliasListQuery).toHaveBeenCalledWith(
      mocks.db,
      userId,
      storeId,
    );
    expect(payload.store).toEqual({ id: storeId, name: "Example Market" });
    expect(payload.learnedProducts).toEqual([
      {
        aliasId: "alias-1",
        normalizedText: "dried mango",
        updatedAt: now.toISOString(),
        productConcept: {
          id: validConceptId,
          canonicalName: "Dried fruit",
          normalizedName: "dried fruit",
        },
        aisleSectionId: validSectionId,
        locationLabel: "Aisle 2 · Dry goods",
      },
    ]);
  });
});

describe("updateLearnedProduct", () => {
  it("rejects updates for aliases the user does not own", async () => {
    // The by-id lookup is user-scoped, so another user's alias (or a deleted
    // one) returns no row.
    mocks.buildLearnedAliasByIdQuery.mockResolvedValue([]);

    await expect(
      updateLearnedProduct(userId, "alias-1", {
        productConceptId: validConceptId,
        aisleSectionId: validSectionId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.buildLearnedAliasByIdQuery).toHaveBeenCalledWith(
      mocks.db,
      userId,
      "alias-1",
    );
    expect(mocks.db.batch).not.toHaveBeenCalled();
  });

  it("re-applies the correction for the learned phrase and returns the refreshed payload", async () => {
    mocks.buildLearnedAliasByIdQuery.mockResolvedValue([alias]);
    mocks.buildProductConceptByIdQuery.mockResolvedValue([productConcept]);
    mocks.db.batch.mockResolvedValue([
      [alias],
      [location],
      [{ id: "shopping-item-1" }],
    ]);

    const payload = await updateLearnedProduct(userId, "alias-1", {
      productConceptId: validConceptId,
      aisleSectionId: validSectionId,
    });

    expect(mocks.buildManualProductAliasCorrectionQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ userId, normalizedText: "dried mango" }),
    );
    expect(payload).toEqual({
      store: { id: storeId, name: "Example Market" },
      learnedProducts: [],
    });
  });
});

describe("deleteLearnedProduct", () => {
  it("rejects deletes for aliases the user does not own", async () => {
    mocks.buildLearnedAliasByIdQuery.mockResolvedValue([]);

    await expect(deleteLearnedProduct(userId, "alias-1")).rejects.toMatchObject(
      { status: 404 },
    );
    expect(mocks.buildLearnedAliasByIdQuery).toHaveBeenCalledWith(
      mocks.db,
      userId,
      "alias-1",
    );
    expect(mocks.buildLearnedAliasDeleteQuery).not.toHaveBeenCalled();
  });

  it("deletes the alias and returns the refreshed payload", async () => {
    mocks.buildLearnedAliasByIdQuery.mockResolvedValue([alias]);
    mocks.buildLearnedAliasDeleteQuery.mockReturnValue("delete-query");

    const payload = await deleteLearnedProduct(userId, "alias-1");

    expect(mocks.buildLearnedAliasDeleteQuery).toHaveBeenCalledWith(
      mocks.db,
      "alias-1",
    );
    expect(payload).toEqual({
      store: { id: storeId, name: "Example Market" },
      learnedProducts: [],
    });
  });
});
