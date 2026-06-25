import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {};

  return {
    buildActiveShoppingListCreateQuery: vi.fn(),
    buildActiveShoppingListQuery: vi.fn(),
    buildRouteOrderedShoppingItemsQuery: vi.fn(),
    buildShoppingItemCheckStateQuery: vi.fn(),
    buildShoppingItemUpsertQuery: vi.fn(),
    db,
    getDb: vi.fn(() => db),
    getStoreLayout: vi.fn(),
    resolveProductMatchForStore: vi.fn(),
  };
});

vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/db/repositories/shopping-lists", () => ({
  buildActiveShoppingListCreateQuery: mocks.buildActiveShoppingListCreateQuery,
  buildActiveShoppingListQuery: mocks.buildActiveShoppingListQuery,
  buildRouteOrderedShoppingItemsQuery:
    mocks.buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery: mocks.buildShoppingItemCheckStateQuery,
  buildShoppingItemUpsertQuery: mocks.buildShoppingItemUpsertQuery,
}));
vi.mock("./product-matching", () => ({
  resolveProductMatchForStore: mocks.resolveProductMatchForStore,
}));
vi.mock("./store-layout", () => ({ getStoreLayout: mocks.getStoreLayout }));

import {
  ActiveShoppingListRequestError,
  addActiveShoppingListItem,
  getActiveShoppingList,
  importActiveShoppingListItems,
  setActiveShoppingItemChecked,
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
  mocks.buildShoppingItemUpsertQuery.mockReset();
  mocks.getDb.mockClear();
  mocks.getStoreLayout.mockReset();
  mocks.resolveProductMatchForStore.mockReset();

  mocks.getStoreLayout.mockResolvedValue(layout);
  mocks.buildActiveShoppingListQuery.mockResolvedValue([list]);
  mocks.buildRouteOrderedShoppingItemsQuery.mockResolvedValue([]);
  mocks.resolveProductMatchForStore.mockResolvedValue(matchedRice);
  mocks.buildShoppingItemUpsertQuery.mockResolvedValue([]);
  mocks.buildShoppingItemCheckStateQuery.mockResolvedValue([{ id: itemId }]);
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
});

describe("addActiveShoppingListItem", () => {
  it("resolves and persists a manual item with raw and normalized text", async () => {
    await addActiveShoppingListItem({
      text: "Rice",
      mutationId,
    });

    expect(mocks.resolveProductMatchForStore).toHaveBeenCalledWith({
      storeId,
      text: "Rice",
    });
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
});

describe("importActiveShoppingListItems", () => {
  it("persists one item per parsed line with deterministic import identifiers", async () => {
    await importActiveShoppingListItems({
      text: "Rice\n\nBroccoli",
      mutationId,
    });

    expect(mocks.buildShoppingItemUpsertQuery).toHaveBeenCalledTimes(2);
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
