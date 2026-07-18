import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    batch: vi.fn(),
  };

  return {
    buildAutomaticProductAliasInsertQuery: vi.fn(),
    buildActiveShoppingListCreateQuery: vi.fn(),
    buildActiveShoppingListQuery: vi.fn(),
    buildCompletedShoppingItemsQuery: vi.fn(),
    buildExactProductAliasesLookupQuery: vi.fn(),
    buildRouteOrderedShoppingItemsQuery: vi.fn(),
    buildShoppingItemCheckStateQuery: vi.fn(),
    buildShoppingItemDeleteQuery: vi.fn(),
    buildShoppingItemSnoozeStateQuery: vi.fn(),
    buildShoppingItemTextUpdateQuery: vi.fn(),
    buildShoppingItemQuantityUpdateQuery: vi.fn(),
    buildShoppingItemsByNormalizedTextQuery: vi.fn(),
    buildShoppingItemUpsertQuery: vi.fn(),
    buildSnoozedShoppingItemsQuery: vi.fn(),
    createStoreProductMatcher: vi.fn(),
    categorizeProductsWithProductionModel: vi.fn(),
    db,
    getDb: vi.fn(() => db),
    loadProductConceptCatalog: vi.fn(),
    resolveCurrentStore: vi.fn(),
    resolveProductMatch: vi.fn(),
  };
});

vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/db/repositories/shopping-lists", () => ({
  buildAutomaticProductAliasInsertQuery:
    mocks.buildAutomaticProductAliasInsertQuery,
  buildActiveShoppingListCreateQuery: mocks.buildActiveShoppingListCreateQuery,
  buildActiveShoppingListQuery: mocks.buildActiveShoppingListQuery,
  buildCompletedShoppingItemsQuery: mocks.buildCompletedShoppingItemsQuery,
  buildExactProductAliasesLookupQuery:
    mocks.buildExactProductAliasesLookupQuery,
  buildRouteOrderedShoppingItemsQuery:
    mocks.buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery: mocks.buildShoppingItemCheckStateQuery,
  buildShoppingItemDeleteQuery: mocks.buildShoppingItemDeleteQuery,
  buildShoppingItemSnoozeStateQuery: mocks.buildShoppingItemSnoozeStateQuery,
  buildShoppingItemTextUpdateQuery: mocks.buildShoppingItemTextUpdateQuery,
  buildShoppingItemQuantityUpdateQuery:
    mocks.buildShoppingItemQuantityUpdateQuery,
  buildShoppingItemsByNormalizedTextQuery:
    mocks.buildShoppingItemsByNormalizedTextQuery,
  buildShoppingItemUpsertQuery: mocks.buildShoppingItemUpsertQuery,
  buildSnoozedShoppingItemsQuery: mocks.buildSnoozedShoppingItemsQuery,
}));
vi.mock("./product-matching", () => ({
  createStoreProductMatcher: mocks.createStoreProductMatcher,
}));
vi.mock("./openai-product-categorizer", () => ({
  categorizeProductsWithProductionModel:
    mocks.categorizeProductsWithProductionModel,
}));
vi.mock("./product-concept-catalog", () => ({
  loadProductConceptCatalog: mocks.loadProductConceptCatalog,
}));
vi.mock("./stores", () => ({
  resolveCurrentStore: mocks.resolveCurrentStore,
}));

import {
  deleteActiveShoppingItem,
  getActiveShoppingList,
  getCompletedShoppingList,
  getSnoozedShoppingList,
  importActiveShoppingListItems,
  setActiveShoppingItemChecked,
  SNOOZE_DURATION_MS,
  snoozeActiveShoppingItem,
  updateActiveShoppingItemText,
} from "./active-shopping-list";

const storeId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const userId = "user-a";
const itemId = "33333333-3333-4333-8333-333333333333";
const mutationId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-01-01T00:00:00Z");

const store = {
  id: storeId,
  name: "Example Market",
};

const list = {
  id: listId,
  userId,
  state: "active" as const,
  source: "manual" as const,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const matchedRice = {
  state: "matched" as const,
  rawText: "Rice",
  normalizedText: "rice",
  productConcept: {
    id: "rice",
    canonicalName: "rice",
    normalizedName: "rice",
    excludedTerms: [],
  },
  confidence: 0.95,
  source: "canonical-name" as const,
  rationale: "Matched rice.",
  location: {
    id: "location-1",
    aisleSectionId: "section-1",
    positionWithinSection: 2,
    confidence: 1,
    source: "curated" as const,
  },
};

beforeEach(() => {
  mocks.buildAutomaticProductAliasInsertQuery.mockReset();
  mocks.buildActiveShoppingListCreateQuery.mockReset();
  mocks.buildActiveShoppingListQuery.mockReset();
  mocks.buildCompletedShoppingItemsQuery.mockReset();
  mocks.buildExactProductAliasesLookupQuery.mockReset();
  mocks.buildRouteOrderedShoppingItemsQuery.mockReset();
  mocks.buildShoppingItemCheckStateQuery.mockReset();
  mocks.buildShoppingItemDeleteQuery.mockReset();
  mocks.buildShoppingItemSnoozeStateQuery.mockReset();
  mocks.buildShoppingItemTextUpdateQuery.mockReset();
  mocks.buildShoppingItemQuantityUpdateQuery.mockReset();
  mocks.buildShoppingItemsByNormalizedTextQuery.mockReset();
  mocks.buildShoppingItemUpsertQuery.mockReset();
  mocks.buildSnoozedShoppingItemsQuery.mockReset();
  mocks.createStoreProductMatcher.mockReset();
  mocks.categorizeProductsWithProductionModel.mockReset();
  mocks.db.batch.mockReset();
  mocks.getDb.mockClear();
  mocks.loadProductConceptCatalog.mockReset();
  mocks.resolveCurrentStore.mockReset();
  mocks.resolveProductMatch.mockReset();

  mocks.resolveCurrentStore.mockResolvedValue(store);
  mocks.buildActiveShoppingListQuery.mockResolvedValue([list]);
  mocks.buildCompletedShoppingItemsQuery.mockResolvedValue([]);
  mocks.buildExactProductAliasesLookupQuery.mockResolvedValue([]);
  mocks.buildRouteOrderedShoppingItemsQuery.mockResolvedValue([]);
  mocks.buildSnoozedShoppingItemsQuery.mockResolvedValue([]);
  mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([]);
  mocks.createStoreProductMatcher.mockResolvedValue(mocks.resolveProductMatch);
  mocks.loadProductConceptCatalog.mockResolvedValue([
    {
      id: "rice",
      canonicalName: "Rice",
      normalizedName: "rice",
      excludedTerms: [],
    },
  ]);
  mocks.db.batch.mockResolvedValue([]);
  mocks.resolveProductMatch.mockResolvedValue(matchedRice);
  mocks.buildShoppingItemUpsertQuery.mockImplementation((_, input) => ({
    input,
  }));
  mocks.buildShoppingItemCheckStateQuery.mockResolvedValue([{ id: itemId }]);
  mocks.buildShoppingItemDeleteQuery.mockResolvedValue([{ id: itemId }]);
  mocks.buildShoppingItemSnoozeStateQuery.mockResolvedValue([{ id: itemId }]);
  mocks.buildShoppingItemTextUpdateQuery.mockResolvedValue([{ id: itemId }]);
  mocks.buildShoppingItemQuantityUpdateQuery.mockImplementation((_, input) => ({
    quantityUpdate: input,
  }));
});

describe("getActiveShoppingList", () => {
  it("returns the list without a store when no store exists", async () => {
    mocks.resolveCurrentStore.mockResolvedValue(null);

    const result = await getActiveShoppingList(userId);

    expect(result.store).toBeNull();
    expect(mocks.buildRouteOrderedShoppingItemsQuery).toHaveBeenCalledWith(
      mocks.db,
      null,
      listId,
      expect.any(Date),
    );
  });

  it("creates the active list when none exists and returns route-ordered items", async () => {
    mocks.buildActiveShoppingListQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([list]);
    mocks.buildActiveShoppingListCreateQuery.mockResolvedValue([list]);
    mocks.buildRouteOrderedShoppingItemsQuery.mockResolvedValue([
      {
        item: {
          id: itemId,
          shoppingListId: listId,
          rawText: "Rice",
          normalizedText: "rice",
          productConceptId: "rice",
          isChecked: false,
          checkedAt: null,
          orderKey: "1",
          sourceIdentifier: "manual:1",
          mutationId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        productConcept: {
          id: "rice",
          canonicalName: "rice",
          normalizedName: "rice",
          excludedTerms: [],
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        productLocation: {
          id: "location-1",
          storeId,
          productConceptId: "rice",
          aisleSectionId: "section-1",
          positionWithinSection: 2,
          confidence: 1,
          source: "curated",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        aisleSection: {
          id: "section-1",
          storeId,
          aisleId: "aisle-1",
          label: "Dry goods",
          pathOrder: 4,
          side: "center",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        aisle: {
          id: "aisle-1",
          storeId,
          identifier: "3",
          displayName: null,
          displayOrder: 0,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      },
    ]);

    const result = await getActiveShoppingList(userId);

    expect(mocks.buildActiveShoppingListCreateQuery).toHaveBeenCalledWith(
      mocks.db,
      userId,
    );
    expect(result.items[0]).toMatchObject({
      id: itemId,
      rawText: "Rice",
      resolutionState: "route-resolved",
      location: {
        aisleSection: {
          aisleIdentifier: "3",
          label: "Dry goods",
          pathOrder: 4,
        },
      },
    });
  });
});

describe("getCompletedShoppingList", () => {
  it("does not create a shopping list when no list exists", async () => {
    mocks.buildActiveShoppingListQuery.mockResolvedValue([]);

    const result = await getCompletedShoppingList(userId);

    expect(result).toBeNull();
    expect(mocks.buildActiveShoppingListCreateQuery).not.toHaveBeenCalled();
    expect(mocks.buildCompletedShoppingItemsQuery).not.toHaveBeenCalled();
  });

  it("returns completed items from the active shopping list", async () => {
    const completedAt = new Date("2026-01-02T00:00:00Z");
    mocks.buildCompletedShoppingItemsQuery.mockResolvedValue([
      {
        item: {
          id: itemId,
          shoppingListId: listId,
          rawText: "Rice",
          normalizedText: "rice",
          productConceptId: null,
          isChecked: true,
          checkedAt: completedAt,
          orderKey: "1",
          sourceIdentifier: "manual:1",
          mutationId,
          version: 1,
          createdAt: now,
          updatedAt: completedAt,
        },
        productConcept: null,
        productLocation: null,
        aisleSection: null,
        aisle: null,
      },
    ]);

    const result = await getCompletedShoppingList(userId);

    expect(mocks.buildCompletedShoppingItemsQuery).toHaveBeenCalledWith(
      mocks.db,
      storeId,
      listId,
      expect.any(Date),
    );
    expect(mocks.buildRouteOrderedShoppingItemsQuery).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected completed shopping list result.");
    }
    expect(result.items).toEqual([
      expect.objectContaining({
        id: itemId,
        isChecked: true,
        checkedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
  });
});

describe("importActiveShoppingListItems", () => {
  it("categorizes unresolved submitted items in one AI batch", async () => {
    mocks.categorizeProductsWithProductionModel.mockImplementation(
      async (request) => ({
        results: request.items.map(
          (item: { key: string; submittedText: string }) => ({
            key: item.key,
            itemName: item.submittedText,
            quantityText: null,
            resolution: {
              kind: "existing" as const,
              productConceptId: "rice",
            },
          }),
        ),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    );

    await importActiveShoppingListItems(userId, {
      text: "Rice\nBroccoli",
      mutationId,
    });

    expect(mocks.categorizeProductsWithProductionModel).toHaveBeenCalledTimes(
      1,
    );
    expect(
      mocks.categorizeProductsWithProductionModel.mock.calls[0]?.[0].items,
    ).toHaveLength(2);
    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenCalledTimes(2);
    expect(mocks.buildAutomaticProductAliasInsertQuery).toHaveBeenCalledTimes(
      2,
    );
    expect(mocks.buildAutomaticProductAliasInsertQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        userId,
        shoppingListId: listId,
        sourceIdentifier: `import:${mutationId}:0`,
        normalizedText: "rice",
        productConceptId: "rice",
      }),
    );
  });

  it("does not learn an automatic alias for an AI-suggested concept", async () => {
    mocks.categorizeProductsWithProductionModel.mockResolvedValue({
      results: [
        {
          key: `import:${mutationId}:0`,
          itemName: "Paper towels",
          quantityText: null,
          resolution: {
            kind: "suggested",
            canonicalName: "Paper products",
          },
        },
      ],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    await importActiveShoppingListItems(userId, {
      text: "Paper towels",
      mutationId,
    });

    expect(mocks.buildAutomaticProductAliasInsertQuery).not.toHaveBeenCalled();
  });

  it("does not relearn an alias when the submitted item matched one", async () => {
    mocks.buildExactProductAliasesLookupQuery.mockResolvedValue([
      {
        alias: {
          normalizedText: "rice",
          confidence: 1,
          source: "learned",
        },
        productConcept: {
          id: "rice",
        },
      },
    ]);

    await importActiveShoppingListItems(userId, {
      text: "Rice",
      mutationId,
    });

    expect(mocks.categorizeProductsWithProductionModel).not.toHaveBeenCalled();
    expect(mocks.buildAutomaticProductAliasInsertQuery).not.toHaveBeenCalled();
    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ categorizationSource: "learned-alias" }),
    );
  });

  it("replaces the quantity on an existing unchecked item", async () => {
    mocks.categorizeProductsWithProductionModel.mockResolvedValue({
      results: [
        {
          key: `import:${mutationId}:0`,
          itemName: "Apples",
          quantityText: "2",
          resolution: {
            kind: "existing",
            productConceptId: "rice",
          },
        },
      ],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: itemId,
        rawText: "Apples",
        normalizedText: "apples",
        quantityText: "1",
        sourceIdentifier: "manual:existing",
      },
    ]);

    const result = await importActiveShoppingListItems(userId, {
      text: "Apples 2",
      mutationId,
    });

    expect(result.updatedQuantities).toEqual(["Apples"]);
    expect(mocks.buildShoppingItemUpsertQuery).not.toHaveBeenCalled();
    expect(mocks.buildShoppingItemQuantityUpdateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ itemId, quantityText: "2" }),
    );
  });

  it("does not write items when AI categorization fails", async () => {
    mocks.categorizeProductsWithProductionModel.mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(
      importActiveShoppingListItems(userId, {
        text: "Rice",
        mutationId,
      }),
    ).rejects.toMatchObject({
      code: "AI_CATEGORIZATION_UNAVAILABLE",
      status: 503,
    });

    expect(
      mocks.buildShoppingItemsByNormalizedTextQuery,
    ).not.toHaveBeenCalled();
    expect(mocks.buildShoppingItemUpsertQuery).not.toHaveBeenCalled();
    expect(mocks.db.batch).not.toHaveBeenCalled();
  });

  it("persists one item per parsed line with deterministic import identifiers", async () => {
    await importActiveShoppingListItems(userId, {
      text: "Rice\n\nBroccoli",
      mutationId,
      categorizationMode: "deterministic",
    });

    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenCalledTimes(2);
    expect(mocks.createStoreProductMatcher).toHaveBeenCalledTimes(1);
    expect(mocks.resolveProductMatch).toHaveBeenCalledTimes(2);
    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenNthCalledWith(
      1,
      mocks.db,
      expect.objectContaining({
        rawText: "Rice",
        sourceIdentifier: `import:${mutationId}:0`,
      }),
    );
    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenNthCalledWith(
      2,
      mocks.db,
      expect.objectContaining({
        rawText: "Broccoli",
        sourceIdentifier: `import:${mutationId}:1`,
      }),
    );
    expect(mocks.db.batch).toHaveBeenCalledWith([
      expect.objectContaining({
        input: expect.objectContaining({ rawText: "Rice" }),
      }),
      expect.objectContaining({
        input: expect.objectContaining({ rawText: "Broccoli" }),
      }),
    ]);
  });

  it("adds new items and reports existing items by name", async () => {
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: itemId,
        rawText: "Oatly",
        normalizedText: "oatly",
        quantityText: null,
        sourceIdentifier: "manual:existing",
      },
    ]);

    const result = await importActiveShoppingListItems(userId, {
      text: "oAtLy\nBroccoli",
      mutationId,
      categorizationMode: "deterministic",
    });

    expect(result.alreadyOnList).toEqual(["Oatly"]);
    expect(mocks.resolveProductMatch).toHaveBeenCalledTimes(2);
    expect(mocks.db.batch).toHaveBeenCalledWith([
      expect.objectContaining({
        input: expect.objectContaining({
          rawText: "Broccoli",
          sourceIdentifier: `import:${mutationId}:1`,
        }),
      }),
    ]);
  });

  it("adds the first occurrence of a repeated import item and reports its name", async () => {
    const result = await importActiveShoppingListItems(userId, {
      text: "Oatly\noAtLy",
      mutationId,
      categorizationMode: "deterministic",
    });

    expect(result.alreadyOnList).toEqual([]);
    expect(mocks.resolveProductMatch).toHaveBeenCalledTimes(2);
    expect(mocks.db.batch).toHaveBeenCalledWith([
      expect.objectContaining({
        input: expect.objectContaining({
          rawText: "Oatly",
          sourceIdentifier: `import:${mutationId}:0`,
        }),
      }),
    ]);
  });

  it("does not rewrite an item that was already on the list", async () => {
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: itemId,
        rawText: "Oatly",
        normalizedText: "oatly",
        quantityText: null,
        sourceIdentifier: "manual:existing",
      },
    ]);

    const result = await importActiveShoppingListItems(userId, {
      text: "oAtLy",
      mutationId,
      categorizationMode: "deterministic",
    });

    expect(result.alreadyOnList).toEqual(["Oatly"]);
    expect(mocks.createStoreProductMatcher).toHaveBeenCalledTimes(1);
    expect(mocks.db.batch).not.toHaveBeenCalled();
  });

  it("does not start import writes when one parsed line fails to prepare", async () => {
    mocks.resolveProductMatch
      .mockResolvedValueOnce(matchedRice)
      .mockRejectedValueOnce(new Error("matching failed"));

    await expect(
      importActiveShoppingListItems(userId, {
        text: "Rice\nBroccoli",
        mutationId,
        categorizationMode: "deterministic",
      }),
    ).rejects.toThrow("matching failed");

    expect(mocks.buildShoppingItemUpsertQuery).not.toHaveBeenCalled();
    expect(mocks.db.batch).not.toHaveBeenCalled();
  });

  it("surfaces import parse errors before touching the database", async () => {
    await expect(
      importActiveShoppingListItems(userId, {
        text: "\n",
        mutationId,
        categorizationMode: "deterministic",
      }),
    ).rejects.toMatchObject({
      fieldErrors: { text: ["Paste at least one item, one per line."] },
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});

describe("setActiveShoppingItemChecked", () => {
  it("updates the target item within the active list", async () => {
    await setActiveShoppingItemChecked({ userId, itemId, isChecked: true });

    expect(mocks.buildShoppingItemCheckStateQuery).toHaveBeenCalledWith(
      mocks.db,
      {
        shoppingListId: listId,
        itemId,
        isChecked: true,
      },
    );
  });

  it("can return the completed view after a completed-screen update", async () => {
    await setActiveShoppingItemChecked({
      userId,
      itemId,
      isChecked: false,
      responseView: "completed",
    });

    expect(mocks.buildShoppingItemCheckStateQuery).toHaveBeenCalledWith(
      mocks.db,
      {
        shoppingListId: listId,
        itemId,
        isChecked: false,
      },
    );
    expect(mocks.buildCompletedShoppingItemsQuery).toHaveBeenCalledWith(
      mocks.db,
      storeId,
      listId,
      expect.any(Date),
    );
  });

  it("returns a not-found request error when the item is outside the active list", async () => {
    mocks.buildShoppingItemCheckStateQuery.mockResolvedValue([]);

    await expect(
      setActiveShoppingItemChecked({ userId, itemId, isChecked: true }),
    ).rejects.toMatchObject({
      status: 404,
      fieldErrors: { itemId: ["Choose an item in the active list."] },
    });
  });

  it("does not create a list as a side effect when the user has none", async () => {
    mocks.buildActiveShoppingListQuery.mockResolvedValue([]);

    await expect(
      setActiveShoppingItemChecked({ userId, itemId, isChecked: true }),
    ).rejects.toMatchObject({ status: 404 });

    expect(mocks.buildActiveShoppingListCreateQuery).not.toHaveBeenCalled();
    expect(mocks.buildShoppingItemCheckStateQuery).not.toHaveBeenCalled();
  });
});

describe("snoozeActiveShoppingItem", () => {
  it("snoozes an item one hour into the future", async () => {
    const before = Date.now();

    await snoozeActiveShoppingItem({ userId, itemId, snoozed: true });

    expect(mocks.buildShoppingItemSnoozeStateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        shoppingListId: listId,
        itemId,
        snoozedUntil: expect.any(Date),
      }),
    );

    const call = mocks.buildShoppingItemSnoozeStateQuery.mock.calls[0][1];
    const snoozedUntilMs = (call.snoozedUntil as Date).getTime();
    expect(snoozedUntilMs).toBeGreaterThanOrEqual(before + SNOOZE_DURATION_MS);
    expect(snoozedUntilMs).toBeLessThanOrEqual(Date.now() + SNOOZE_DURATION_MS);
  });

  it("clears the snooze when restoring an item to the list", async () => {
    await snoozeActiveShoppingItem({
      userId,
      itemId,
      snoozed: false,
      responseView: "snoozed",
    });

    expect(mocks.buildShoppingItemSnoozeStateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ snoozedUntil: null }),
    );
    expect(mocks.buildSnoozedShoppingItemsQuery).toHaveBeenCalledWith(
      mocks.db,
      storeId,
      listId,
      expect.any(Date),
    );
  });

  it("returns a not-found request error when the item is outside the active list", async () => {
    mocks.buildShoppingItemSnoozeStateQuery.mockResolvedValue([]);

    await expect(
      snoozeActiveShoppingItem({ userId, itemId, snoozed: true }),
    ).rejects.toMatchObject({
      status: 404,
      fieldErrors: { itemId: ["Choose an item in the active list."] },
    });
  });
});

describe("getSnoozedShoppingList", () => {
  it("does not create a shopping list when no list exists", async () => {
    mocks.buildActiveShoppingListQuery.mockResolvedValue([]);

    const result = await getSnoozedShoppingList(userId);

    expect(result).toBeNull();
    expect(mocks.buildActiveShoppingListCreateQuery).not.toHaveBeenCalled();
    expect(mocks.buildSnoozedShoppingItemsQuery).not.toHaveBeenCalled();
  });

  it("reads snoozed items relative to the current time", async () => {
    const snoozedUntil = new Date("2026-01-01T01:00:00Z");
    mocks.buildSnoozedShoppingItemsQuery.mockResolvedValue([
      {
        item: {
          id: itemId,
          shoppingListId: listId,
          rawText: "Rice",
          normalizedText: "rice",
          productConceptId: null,
          isChecked: false,
          checkedAt: null,
          snoozedUntil,
          orderKey: "1",
          sourceIdentifier: "manual:1",
          mutationId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        productConcept: null,
        productLocation: null,
        aisleSection: null,
        aisle: null,
      },
    ]);

    const result = await getSnoozedShoppingList(userId);

    expect(mocks.buildSnoozedShoppingItemsQuery).toHaveBeenCalledWith(
      mocks.db,
      storeId,
      listId,
      expect.any(Date),
    );
    expect(result?.items).toEqual([
      expect.objectContaining({
        id: itemId,
        isChecked: false,
        snoozedUntil: "2026-01-01T01:00:00.000Z",
      }),
    ]);
  });
});

describe("updateActiveShoppingItemText", () => {
  it("re-resolves text edits and preserves active-list membership", async () => {
    await updateActiveShoppingItemText({
      userId,
      itemId,
      text: "Rice",
    });

    expect(mocks.buildShoppingItemsByNormalizedTextQuery).toHaveBeenCalledWith(
      mocks.db,
      {
        shoppingListId: listId,
        normalizedTexts: ["rice"],
      },
    );
    expect(mocks.createStoreProductMatcher).toHaveBeenCalledWith({
      db: mocks.db,
      userId,
      storeId,
    });
    expect(mocks.resolveProductMatch).toHaveBeenCalledWith("Rice");
    expect(mocks.buildShoppingItemTextUpdateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        shoppingListId: listId,
        itemId,
        rawText: "Rice",
        normalizedText: "rice",
        productConceptId: "rice",
      }),
    );
  });

  it("allows editing casing on the same item", async () => {
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: itemId,
        rawText: "rice",
        normalizedText: "rice",
        sourceIdentifier: "manual:existing",
      },
    ]);

    await updateActiveShoppingItemText({
      userId,
      itemId,
      text: "Rice",
    });

    expect(mocks.buildShoppingItemTextUpdateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        itemId,
        rawText: "Rice",
        normalizedText: "rice",
      }),
    );
  });

  it("rejects editing an item into another active item", async () => {
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: "55555555-5555-4555-8555-555555555555",
        rawText: "Rice",
        normalizedText: "rice",
        sourceIdentifier: "manual:other",
      },
    ]);

    await expect(
      updateActiveShoppingItemText({
        userId,
        itemId,
        text: "Rice",
      }),
    ).rejects.toMatchObject({
      status: 409,
      fieldErrors: { text: ["This item is already on the list."] },
    });

    expect(mocks.createStoreProductMatcher).not.toHaveBeenCalled();
    expect(mocks.buildShoppingItemTextUpdateQuery).not.toHaveBeenCalled();
  });

  it("returns a not-found request error when editing an item outside the active list", async () => {
    mocks.buildShoppingItemTextUpdateQuery.mockResolvedValue([]);

    await expect(
      updateActiveShoppingItemText({
        userId,
        itemId,
        text: "Rice",
      }),
    ).rejects.toMatchObject({
      status: 404,
      fieldErrors: { itemId: ["Choose an item in the active list."] },
    });
  });
});

describe("deleteActiveShoppingItem", () => {
  it("deletes the target item within the active list", async () => {
    await deleteActiveShoppingItem({ userId, itemId });

    expect(mocks.buildShoppingItemDeleteQuery).toHaveBeenCalledWith(mocks.db, {
      shoppingListId: listId,
      itemId,
    });
  });

  it("returns a not-found request error when deleting an item outside the active list", async () => {
    mocks.buildShoppingItemDeleteQuery.mockResolvedValue([]);

    await expect(
      deleteActiveShoppingItem({ userId, itemId }),
    ).rejects.toMatchObject({
      status: 404,
      fieldErrors: { itemId: ["Choose an item in the active list."] },
    });
  });
});

describe("cross-user isolation", () => {
  const otherUserId = "user-b";
  const otherListId = "99999999-9999-4999-8999-999999999999";
  const otherList = { ...list, id: otherListId, userId: otherUserId };

  beforeEach(() => {
    // Each user resolves strictly their own active list.
    mocks.buildActiveShoppingListQuery.mockImplementation(
      (_db, requestedUserId) =>
        Promise.resolve(requestedUserId === otherUserId ? [otherList] : [list]),
    );
    // The item exists only in user A's list; a mutation scoped to any other
    // list matches nothing.
    mocks.buildShoppingItemCheckStateQuery.mockImplementation((_db, input) =>
      Promise.resolve(
        input.shoppingListId === listId ? [{ id: input.itemId }] : [],
      ),
    );
    mocks.buildShoppingItemDeleteQuery.mockImplementation((_db, input) =>
      Promise.resolve(
        input.shoppingListId === listId ? [{ id: input.itemId }] : [],
      ),
    );
  });

  it("resolves the active list strictly by the requesting user", async () => {
    await getActiveShoppingList(otherUserId);

    expect(mocks.buildActiveShoppingListQuery).toHaveBeenCalledWith(
      mocks.db,
      otherUserId,
    );
  });

  it("cannot check another user's item: the mutation is scoped to the caller's own list and 404s", async () => {
    // user B targets an item that lives on user A's list.
    await expect(
      setActiveShoppingItemChecked({
        userId: otherUserId,
        itemId,
        isChecked: true,
      }),
    ).rejects.toMatchObject({ status: 404 });

    // The check ran against user B's own list, never user A's.
    expect(mocks.buildShoppingItemCheckStateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ shoppingListId: otherListId, itemId }),
    );
    expect(mocks.buildShoppingItemCheckStateQuery).not.toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ shoppingListId: listId }),
    );
  });

  it("cannot delete another user's item", async () => {
    await expect(
      deleteActiveShoppingItem({ userId: otherUserId, itemId }),
    ).rejects.toMatchObject({ status: 404 });

    expect(mocks.buildShoppingItemDeleteQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ shoppingListId: otherListId, itemId }),
    );
    expect(mocks.buildShoppingItemDeleteQuery).not.toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ shoppingListId: listId }),
    );
  });

  it("lets the owning user act on their own item", async () => {
    await setActiveShoppingItemChecked({ userId, itemId, isChecked: true });

    expect(mocks.buildShoppingItemCheckStateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ shoppingListId: listId, itemId }),
    );
  });
});
