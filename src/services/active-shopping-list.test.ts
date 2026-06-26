import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    batch: vi.fn(),
  };

  return {
    buildActiveShoppingListCreateQuery: vi.fn(),
    buildActiveShoppingListQuery: vi.fn(),
    buildRouteOrderedShoppingItemsQuery: vi.fn(),
    buildShoppingItemCheckStateQuery: vi.fn(),
    buildShoppingItemDeleteQuery: vi.fn(),
    buildShoppingItemTextUpdateQuery: vi.fn(),
    buildShoppingItemsByNormalizedTextQuery: vi.fn(),
    buildShoppingItemUpsertQuery: vi.fn(),
    createStoreProductMatcher: vi.fn(),
    db,
    getDb: vi.fn(() => db),
    getStoreLayout: vi.fn(),
    resolveProductMatch: vi.fn(),
  };
});

vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/db/repositories/shopping-lists", () => ({
  buildActiveShoppingListCreateQuery: mocks.buildActiveShoppingListCreateQuery,
  buildActiveShoppingListQuery: mocks.buildActiveShoppingListQuery,
  buildRouteOrderedShoppingItemsQuery:
    mocks.buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery: mocks.buildShoppingItemCheckStateQuery,
  buildShoppingItemDeleteQuery: mocks.buildShoppingItemDeleteQuery,
  buildShoppingItemTextUpdateQuery: mocks.buildShoppingItemTextUpdateQuery,
  buildShoppingItemsByNormalizedTextQuery:
    mocks.buildShoppingItemsByNormalizedTextQuery,
  buildShoppingItemUpsertQuery: mocks.buildShoppingItemUpsertQuery,
}));
vi.mock("./product-matching", () => ({
  createStoreProductMatcher: mocks.createStoreProductMatcher,
}));
vi.mock("./store-layout", () => ({ getStoreLayout: mocks.getStoreLayout }));

import {
  ActiveShoppingListRequestError,
  addActiveShoppingListItem,
  deleteActiveShoppingItem,
  getActiveShoppingList,
  importActiveShoppingListItems,
  setActiveShoppingItemChecked,
  updateActiveShoppingItemText,
} from "./active-shopping-list";

const storeId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const mutationId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-01-01T00:00:00Z");

const layout = {
  id: storeId,
  name: "Example Market",
  aisles: [],
};

const list = {
  id: listId,
  storeId,
  sourceConnectionId: null,
  externalId: null,
  state: "active" as const,
  source: "manual" as const,
  syncState: "synced" as const,
  syncCursor: null,
  lastSyncedAt: null,
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
  mocks.buildActiveShoppingListCreateQuery.mockReset();
  mocks.buildActiveShoppingListQuery.mockReset();
  mocks.buildRouteOrderedShoppingItemsQuery.mockReset();
  mocks.buildShoppingItemCheckStateQuery.mockReset();
  mocks.buildShoppingItemDeleteQuery.mockReset();
  mocks.buildShoppingItemTextUpdateQuery.mockReset();
  mocks.buildShoppingItemsByNormalizedTextQuery.mockReset();
  mocks.buildShoppingItemUpsertQuery.mockReset();
  mocks.createStoreProductMatcher.mockReset();
  mocks.db.batch.mockReset();
  mocks.getDb.mockClear();
  mocks.getStoreLayout.mockReset();
  mocks.resolveProductMatch.mockReset();

  mocks.getStoreLayout.mockResolvedValue(layout);
  mocks.buildActiveShoppingListQuery.mockResolvedValue([list]);
  mocks.buildRouteOrderedShoppingItemsQuery.mockResolvedValue([]);
  mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([]);
  mocks.createStoreProductMatcher.mockResolvedValue(mocks.resolveProductMatch);
  mocks.db.batch.mockResolvedValue([]);
  mocks.resolveProductMatch.mockResolvedValue(matchedRice);
  mocks.buildShoppingItemUpsertQuery.mockImplementation((_, input) => ({
    input,
  }));
  mocks.buildShoppingItemCheckStateQuery.mockResolvedValue([{ id: itemId }]);
  mocks.buildShoppingItemDeleteQuery.mockResolvedValue([{ id: itemId }]);
  mocks.buildShoppingItemTextUpdateQuery.mockResolvedValue([{ id: itemId }]);
});

describe("getActiveShoppingList", () => {
  it("requires a saved store layout before creating list data", async () => {
    mocks.getStoreLayout.mockResolvedValue(null);

    await expect(getActiveShoppingList()).rejects.toBeInstanceOf(
      ActiveShoppingListRequestError,
    );
    await expect(getActiveShoppingList()).rejects.toMatchObject({
      status: 409,
      fieldErrors: {
        form: ["Create and save a store layout before adding shopping items."],
      },
    });
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
          storeId,
          shoppingListId: listId,
          rawText: "Rice",
          normalizedText: "rice",
          productConceptId: "rice",
          resolvedLocationId: "location-1",
          isChecked: false,
          checkedAt: null,
          orderKey: "1",
          sourceIdentifier: "manual:1",
          syncState: "synced",
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

    const result = await getActiveShoppingList();

    expect(mocks.buildActiveShoppingListCreateQuery).toHaveBeenCalledWith(
      mocks.db,
      storeId,
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

  it("keeps resolution state coherent when a route location is joined without a product concept", async () => {
    mocks.buildRouteOrderedShoppingItemsQuery.mockResolvedValue([
      {
        item: {
          id: itemId,
          storeId,
          shoppingListId: listId,
          rawText: "Rice",
          normalizedText: "rice",
          productConceptId: null,
          resolvedLocationId: "location-1",
          isChecked: false,
          checkedAt: null,
          orderKey: "1",
          sourceIdentifier: "manual:1",
          syncState: "synced",
          mutationId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        productConcept: null,
        productLocation: {
          id: "location-1",
          storeId,
          productConceptId: "deleted-rice",
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

    const result = await getActiveShoppingList();

    expect(result.items[0]).toMatchObject({
      resolutionState: "route-resolved",
      productConcept: null,
      location: {
        id: "location-1",
        aisleSection: {
          aisleIdentifier: "3",
          label: "Dry goods",
        },
      },
    });
  });
});

describe("addActiveShoppingListItem", () => {
  it("resolves and persists a manual item with raw and normalized text", async () => {
    await addActiveShoppingListItem({
      text: "Rice",
      mutationId,
    });

    expect(mocks.createStoreProductMatcher).toHaveBeenCalledWith({
      db: mocks.db,
      storeId,
    });
    expect(mocks.resolveProductMatch).toHaveBeenCalledWith("Rice");
    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        storeId,
        shoppingListId: listId,
        rawText: "Rice",
        normalizedText: "rice",
        productConceptId: "rice",
        resolvedLocationId: "location-1",
        sourceIdentifier: `manual:${mutationId}`,
        mutationId,
      }),
    );
  });

  it("rejects an item already on the active list regardless of capitalization", async () => {
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: itemId,
        rawText: "Oatly",
        normalizedText: "oatly",
        sourceIdentifier: "manual:existing",
      },
    ]);

    await expect(
      addActiveShoppingListItem({
        text: "oAtLy",
        mutationId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      fieldErrors: { text: ["This item is already on the list."] },
    });

    expect(mocks.createStoreProductMatcher).not.toHaveBeenCalled();
    expect(mocks.buildShoppingItemUpsertQuery).not.toHaveBeenCalled();
  });

  it("allows a retry of the same manual mutation to remain idempotent", async () => {
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: itemId,
        rawText: "Oatly",
        normalizedText: "oatly",
        sourceIdentifier: `manual:${mutationId}`,
      },
    ]);

    await addActiveShoppingListItem({
      text: "Oatly",
      mutationId,
    });

    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        rawText: "Oatly",
        normalizedText: "oatly",
        sourceIdentifier: `manual:${mutationId}`,
      }),
    );
  });
});

describe("importActiveShoppingListItems", () => {
  it("persists one item per parsed line with deterministic import identifiers", async () => {
    await importActiveShoppingListItems({
      text: "Rice\n\nBroccoli",
      mutationId,
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

  it("rejects imported items already on the active list regardless of capitalization", async () => {
    mocks.buildShoppingItemsByNormalizedTextQuery.mockResolvedValue([
      {
        id: itemId,
        rawText: "Oatly",
        normalizedText: "oatly",
        sourceIdentifier: "manual:existing",
      },
    ]);

    await expect(
      importActiveShoppingListItems({
        text: "oAtLy\nBroccoli",
        mutationId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      fieldErrors: {
        text: ["Line 1: This item is already on the list."],
      },
    });

    expect(mocks.createStoreProductMatcher).not.toHaveBeenCalled();
    expect(mocks.db.batch).not.toHaveBeenCalled();
  });

  it("rejects duplicate imported lines before writing any rows", async () => {
    await expect(
      importActiveShoppingListItems({
        text: "Oatly\noAtLy",
        mutationId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      fieldErrors: {
        text: ["Line 2: This item is already on the list."],
      },
    });

    expect(
      mocks.buildShoppingItemsByNormalizedTextQuery,
    ).not.toHaveBeenCalled();
    expect(mocks.createStoreProductMatcher).not.toHaveBeenCalled();
    expect(mocks.db.batch).not.toHaveBeenCalled();
  });

  it("does not start import writes when one parsed line fails to prepare", async () => {
    mocks.resolveProductMatch
      .mockResolvedValueOnce(matchedRice)
      .mockRejectedValueOnce(new Error("matching failed"));

    await expect(
      importActiveShoppingListItems({
        text: "Rice\nBroccoli",
        mutationId,
      }),
    ).rejects.toThrow("matching failed");

    expect(mocks.buildShoppingItemUpsertQuery).not.toHaveBeenCalled();
    expect(mocks.db.batch).not.toHaveBeenCalled();
  });

  it("surfaces import parse errors before touching the database", async () => {
    await expect(
      importActiveShoppingListItems({
        text: "\n",
        mutationId,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { text: ["Paste at least one item, one per line."] },
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});

describe("setActiveShoppingItemChecked", () => {
  it("updates the target item within the active list", async () => {
    await setActiveShoppingItemChecked({ itemId, isChecked: true });

    expect(mocks.buildShoppingItemCheckStateQuery).toHaveBeenCalledWith(
      mocks.db,
      {
        storeId,
        shoppingListId: listId,
        itemId,
        isChecked: true,
      },
    );
  });

  it("returns a not-found request error when the item is outside the active list", async () => {
    mocks.buildShoppingItemCheckStateQuery.mockResolvedValue([]);

    await expect(
      setActiveShoppingItemChecked({ itemId, isChecked: true }),
    ).rejects.toMatchObject({
      status: 404,
      fieldErrors: { itemId: ["Choose an item in the active list."] },
    });
  });
});

describe("updateActiveShoppingItemText", () => {
  it("re-resolves text edits and preserves active-list membership", async () => {
    await updateActiveShoppingItemText({
      itemId,
      text: "Rice",
    });

    expect(mocks.buildShoppingItemsByNormalizedTextQuery).toHaveBeenCalledWith(
      mocks.db,
      {
        storeId,
        shoppingListId: listId,
        normalizedTexts: ["rice"],
      },
    );
    expect(mocks.createStoreProductMatcher).toHaveBeenCalledWith({
      db: mocks.db,
      storeId,
    });
    expect(mocks.resolveProductMatch).toHaveBeenCalledWith("Rice");
    expect(mocks.buildShoppingItemTextUpdateQuery).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        storeId,
        shoppingListId: listId,
        itemId,
        rawText: "Rice",
        normalizedText: "rice",
        productConceptId: "rice",
        resolvedLocationId: "location-1",
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
    await deleteActiveShoppingItem({ itemId });

    expect(mocks.buildShoppingItemDeleteQuery).toHaveBeenCalledWith(mocks.db, {
      storeId,
      shoppingListId: listId,
      itemId,
    });
  });

  it("returns a not-found request error when deleting an item outside the active list", async () => {
    mocks.buildShoppingItemDeleteQuery.mockResolvedValue([]);

    await expect(deleteActiveShoppingItem({ itemId })).rejects.toMatchObject({
      status: 404,
      fieldErrors: { itemId: ["Choose an item in the active list."] },
    });
  });
});
