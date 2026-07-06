import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  MAX_SHOPPING_ITEM_TEXT_LENGTH,
  parseShoppingItemImportLines,
  type ActiveShoppingItemPayload,
  type ActiveShoppingListPayload,
  type FieldErrors,
} from "@/domain/active-shopping-list";
import { normalizeProductText } from "@/domain/product-matching";
import type { StoreSummary } from "@/domain/stores";

import { getDb } from "@/db/client";
import type { Database } from "@/db/create-client";
import {
  buildActiveShoppingListCreateQuery,
  buildActiveShoppingListQuery,
  buildCompletedShoppingItemsQuery,
  buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery,
  buildShoppingItemDeleteQuery,
  buildShoppingItemSnoozeStateQuery,
  buildShoppingItemTextUpdateQuery,
  buildShoppingItemsByNormalizedTextQuery,
  buildShoppingItemUpsertQuery,
  buildSnoozedShoppingItemsQuery,
  type ShoppingItemUpsertInput,
} from "@/db/repositories/shopping-lists";
import type {
  Aisle,
  AisleSection,
  ProductConcept,
  ProductLocation,
  ShoppingItem,
  ShoppingList,
} from "@/db/schema";

import {
  createStoreProductMatcher,
  type StoreProductMatcher,
} from "./product-matching";
import { resolveCurrentStore } from "./stores";

const mutationIdSchema = z.uuid("Provide a valid mutation id.");
const duplicateShoppingItemMessage = "This item is already on the list.";

export const SNOOZE_DURATION_MS = 60 * 60 * 1000;

export type ShoppingListView = "active" | "completed" | "snoozed";

const shoppingItemTextSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length <= MAX_SHOPPING_ITEM_TEXT_LENGTH, {
    message: `Item text must be ${MAX_SHOPPING_ITEM_TEXT_LENGTH} characters or fewer.`,
  })
  .refine((value) => normalizeProductText(value).length > 0, {
    message: "Enter an item with letters or numbers.",
  });

export const activeShoppingItemCreateRequestSchema = z.object({
  text: shoppingItemTextSchema,
  mutationId: mutationIdSchema,
});

export const activeShoppingListImportRequestSchema = z.object({
  text: z.string(),
  mutationId: mutationIdSchema,
});

export const activeShoppingItemUpdateRequestSchema = z
  .object({
    isChecked: z.boolean().optional(),
    snoozed: z.boolean().optional(),
    text: shoppingItemTextSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const updateCount =
      Number(input.isChecked !== undefined) +
      Number(input.snoozed !== undefined) +
      Number(input.text !== undefined);

    if (updateCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Send exactly one item update.",
        path: ["form"],
      });
    }
  });

export type ActiveShoppingItemCreateRequest = z.output<
  typeof activeShoppingItemCreateRequestSchema
>;

export type ActiveShoppingListImportRequest = z.output<
  typeof activeShoppingListImportRequestSchema
>;

export type ActiveShoppingItemUpdateRequest = z.output<
  typeof activeShoppingItemUpdateRequestSchema
>;

export class ActiveShoppingListRequestError extends Error {
  readonly fieldErrors: FieldErrors;
  readonly status: number;

  constructor(message: string, fieldErrors: FieldErrors, status = 422) {
    super(message);
    this.name = "ActiveShoppingListRequestError";
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}

interface RouteOrderedShoppingItemRow {
  item: ShoppingItem;
  productConcept: ProductConcept | null;
  productLocation: ProductLocation | null;
  aisleSection: AisleSection | null;
  aisle: Aisle | null;
}

// The current store is only needed for the final payload read, so callers may
// pass a pending lookup and let it resolve alongside the list queries.
export type CurrentStoreInput =
  StoreSummary | null | Promise<StoreSummary | null>;

export function getActiveShoppingList(
  userId: string,
): Promise<ActiveShoppingListPayload> {
  return getActiveShoppingListForStore(resolveCurrentStore(userId), userId);
}

export async function getActiveShoppingListForStore(
  store: CurrentStoreInput,
  userId: string,
): Promise<ActiveShoppingListPayload> {
  const context = await loadShoppingListContext(
    userId,
    getOrCreateActiveShoppingList,
    store,
  );

  return readShoppingListPayload(
    context.db,
    context.store,
    context.list,
    "active",
  );
}

export function getCompletedShoppingList(
  userId: string,
): Promise<ActiveShoppingListPayload | null> {
  return getCompletedShoppingListForStore(resolveCurrentStore(userId), userId);
}

export function getCompletedShoppingListForStore(
  store: CurrentStoreInput,
  userId: string,
): Promise<ActiveShoppingListPayload | null> {
  return readExistingShoppingList(store, userId, "completed");
}

export function getSnoozedShoppingList(
  userId: string,
): Promise<ActiveShoppingListPayload | null> {
  return getSnoozedShoppingListForStore(resolveCurrentStore(userId), userId);
}

export function getSnoozedShoppingListForStore(
  store: CurrentStoreInput,
  userId: string,
): Promise<ActiveShoppingListPayload | null> {
  return readExistingShoppingList(store, userId, "snoozed");
}

async function readExistingShoppingList(
  store: CurrentStoreInput,
  userId: string,
  view: ShoppingListView,
): Promise<ActiveShoppingListPayload | null> {
  const context = await loadShoppingListContext(
    userId,
    findActiveShoppingList,
    store,
  );

  if (!context.list) {
    return null;
  }

  return readShoppingListPayload(context.db, context.store, context.list, view);
}

export async function addActiveShoppingListItem(
  userId: string,
  input: ActiveShoppingItemCreateRequest,
): Promise<ActiveShoppingListPayload> {
  const { db, store, storeId, list } = await loadShoppingListContext(
    userId,
    getOrCreateActiveShoppingList,
  );
  const now = new Date();
  const sourceIdentifier = `manual:${input.mutationId}`;
  await ensureShoppingItemsAreNew(db, {
    list,
    normalizedItems: [
      {
        normalizedText: normalizeProductText(input.text),
        sourceIdentifier,
      },
    ],
  });
  const resolveProductMatch = await createStoreProductMatcher({
    db,
    storeId,
  });

  await persistShoppingItem(db, {
    list,
    mutationId: input.mutationId,
    now,
    orderIndex: 0,
    rawText: input.text,
    resolveProductMatch,
    sourceIdentifier,
  });

  return readShoppingListPayload(db, store, list, "active");
}

export async function importActiveShoppingListItems(
  userId: string,
  input: ActiveShoppingListImportRequest,
): Promise<ActiveShoppingListPayload> {
  const parsed = parseShoppingItemImportLines(input.text);

  if (!parsed.success) {
    throw new ActiveShoppingListRequestError(
      "Check the highlighted import field.",
      parsed.fieldErrors,
    );
  }

  const { db, store, storeId, list } = await loadShoppingListContext(
    userId,
    getOrCreateActiveShoppingList,
  );
  const now = new Date();
  const normalizedItems = parsed.lines.map((line, index) => ({
    lineNumber: line.lineNumber,
    normalizedText: normalizeProductText(line.rawText),
    sourceIdentifier: `import:${input.mutationId}:${index}`,
  }));
  ensureImportLinesAreUnique(normalizedItems);
  await ensureShoppingItemsAreNew(db, {
    list,
    normalizedItems,
  });
  const resolveProductMatch = await createStoreProductMatcher({
    db,
    storeId,
  });

  const upsertInputs = await Promise.all(
    parsed.lines.map((line, index) => {
      const sourceIdentifier = `import:${input.mutationId}:${index}`;

      return buildShoppingItemUpsertInput({
        list,
        mutationId: deterministicUuid(sourceIdentifier),
        now,
        orderIndex: index,
        rawText: line.rawText,
        resolveProductMatch,
        sourceIdentifier,
      });
    }),
  );

  await batchShoppingItemUpserts(db, upsertInputs);

  return readShoppingListPayload(db, store, list, "active");
}

export async function setActiveShoppingItemChecked({
  userId,
  itemId,
  isChecked,
  responseView = "active",
}: {
  userId: string;
  itemId: string;
  isChecked: boolean;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const { db, store, list } = await loadShoppingListContext(
    userId,
    findActiveShoppingList,
  );

  if (!list) {
    throw activeShoppingItemNotFoundError();
  }

  const [updatedItem] = await buildShoppingItemCheckStateQuery(db, {
    shoppingListId: list.id,
    itemId,
    isChecked,
  });

  if (!updatedItem) {
    throw activeShoppingItemNotFoundError();
  }

  return readShoppingListPayload(db, store, list, responseView);
}

export async function snoozeActiveShoppingItem({
  userId,
  itemId,
  snoozed,
  responseView = "active",
}: {
  userId: string;
  itemId: string;
  snoozed: boolean;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const { db, store, list } = await loadShoppingListContext(
    userId,
    findActiveShoppingList,
  );

  if (!list) {
    throw activeShoppingItemNotFoundError();
  }

  const now = new Date();
  const snoozedUntil = snoozed
    ? new Date(now.getTime() + SNOOZE_DURATION_MS)
    : null;
  const [updatedItem] = await buildShoppingItemSnoozeStateQuery(db, {
    shoppingListId: list.id,
    itemId,
    snoozedUntil,
    now,
  });

  if (!updatedItem) {
    throw activeShoppingItemNotFoundError();
  }

  return readShoppingListPayload(db, store, list, responseView);
}

export async function updateActiveShoppingItemText({
  userId,
  itemId,
  text,
  responseView = "active",
}: {
  userId: string;
  itemId: string;
  text: string;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const { db, store, storeId, list } = await loadShoppingListContext(
    userId,
    findActiveShoppingList,
  );

  if (!list) {
    throw activeShoppingItemNotFoundError();
  }

  const normalizedText = normalizeProductText(text);
  await ensureShoppingItemTextIsAvailable(db, {
    currentItemId: itemId,
    list,
    normalizedText,
  });
  const resolveProductMatch = await createStoreProductMatcher({
    db,
    storeId,
  });
  const match = await resolveProductMatch(text);
  const matched = match.state === "matched";
  const [updatedItem] = await buildShoppingItemTextUpdateQuery(db, {
    shoppingListId: list.id,
    itemId,
    rawText: text,
    normalizedText,
    productConceptId: matched ? match.productConcept.id : null,
  });

  if (!updatedItem) {
    throw activeShoppingItemNotFoundError();
  }

  return readShoppingListPayload(db, store, list, responseView);
}

export async function deleteActiveShoppingItem({
  userId,
  itemId,
  responseView = "active",
}: {
  userId: string;
  itemId: string;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const { db, store, list } = await loadShoppingListContext(
    userId,
    findActiveShoppingList,
  );

  if (!list) {
    throw activeShoppingItemNotFoundError();
  }

  const [deletedItem] = await buildShoppingItemDeleteQuery(db, {
    shoppingListId: list.id,
    itemId,
  });

  if (!deletedItem) {
    throw activeShoppingItemNotFoundError();
  }

  return readShoppingListPayload(db, store, list, responseView);
}

// The current store and the user's list are independent lookups, so every
// entry point resolves them concurrently. Reads and item creation materialize
// the list; item mutations only look it up, so a failed mutation leaves no row
// behind.
async function loadShoppingListContext<List extends ShoppingList | null>(
  userId: string,
  lookupList: (db: Database, userId: string) => Promise<List>,
  store: CurrentStoreInput = resolveCurrentStore(userId),
): Promise<{
  db: Database;
  store: StoreSummary | null;
  storeId: string | null;
  list: List;
}> {
  const db = getDb();
  const [resolvedStore, list] = await Promise.all([
    store,
    lookupList(db, userId),
  ]);

  return { db, store: resolvedStore, storeId: resolvedStore?.id ?? null, list };
}

function activeShoppingItemNotFoundError() {
  return new ActiveShoppingListRequestError(
    "Choose an item in the active list.",
    { itemId: ["Choose an item in the active list."] },
    404,
  );
}

async function findActiveShoppingList(
  db: Database,
  userId: string,
): Promise<ShoppingList | null> {
  const [existing] = await buildActiveShoppingListQuery(db, userId);

  return existing ?? null;
}

async function getOrCreateActiveShoppingList(
  db: Database,
  userId: string,
): Promise<ShoppingList> {
  const existing = await findActiveShoppingList(db, userId);

  if (existing) {
    return existing;
  }

  const [created] = await buildActiveShoppingListCreateQuery(db, userId);

  if (created) {
    return created;
  }

  throw new Error("Active shopping list could not be created.");
}

async function persistShoppingItem(
  db: Database,
  input: {
    list: ShoppingList;
    rawText: string;
    mutationId: string;
    sourceIdentifier: string;
    now: Date;
    orderIndex: number;
    resolveProductMatch: StoreProductMatcher;
  },
) {
  const upsertInput = await buildShoppingItemUpsertInput(input);

  await buildShoppingItemUpsertQuery(db, upsertInput);
}

function ensureImportLinesAreUnique(
  normalizedItems: Array<{
    lineNumber: number;
    normalizedText: string;
  }>,
) {
  const seenNormalizedTexts = new Set<string>();
  const duplicateErrors: string[] = [];

  for (const item of normalizedItems) {
    if (seenNormalizedTexts.has(item.normalizedText)) {
      duplicateErrors.push(
        `Line ${item.lineNumber}: ${duplicateShoppingItemMessage}`,
      );
    }

    seenNormalizedTexts.add(item.normalizedText);
  }

  if (duplicateErrors.length > 0) {
    throw new ActiveShoppingListRequestError(
      duplicateShoppingItemMessage,
      { text: duplicateErrors },
      409,
    );
  }
}

async function ensureShoppingItemsAreNew(
  db: Database,
  input: {
    list: ShoppingList;
    normalizedItems: Array<{
      normalizedText: string;
      sourceIdentifier: string;
      lineNumber?: number;
    }>;
  },
) {
  const uniqueNormalizedTexts = [
    ...new Set(input.normalizedItems.map((item) => item.normalizedText)),
  ];
  const existingItems = await buildShoppingItemsByNormalizedTextQuery(db, {
    shoppingListId: input.list.id,
    normalizedTexts: uniqueNormalizedTexts,
  });
  const existingByNormalizedText = new Map(
    existingItems.map((item) => [item.normalizedText, item]),
  );
  const duplicateErrors = input.normalizedItems.flatMap((item) => {
    const existing = existingByNormalizedText.get(item.normalizedText);

    if (!existing || existing.sourceIdentifier === item.sourceIdentifier) {
      return [];
    }

    return item.lineNumber
      ? [`Line ${item.lineNumber}: ${duplicateShoppingItemMessage}`]
      : [duplicateShoppingItemMessage];
  });

  if (duplicateErrors.length > 0) {
    throw new ActiveShoppingListRequestError(
      duplicateShoppingItemMessage,
      { text: duplicateErrors },
      409,
    );
  }
}

async function ensureShoppingItemTextIsAvailable(
  db: Database,
  input: {
    list: ShoppingList;
    currentItemId: string;
    normalizedText: string;
  },
) {
  const existingItems = await buildShoppingItemsByNormalizedTextQuery(db, {
    shoppingListId: input.list.id,
    normalizedTexts: [input.normalizedText],
  });
  const duplicateItem = existingItems.find(
    (item) => item.id !== input.currentItemId,
  );

  if (duplicateItem) {
    throw new ActiveShoppingListRequestError(
      duplicateShoppingItemMessage,
      { text: [duplicateShoppingItemMessage] },
      409,
    );
  }
}

async function buildShoppingItemUpsertInput(input: {
  list: ShoppingList;
  rawText: string;
  mutationId: string;
  sourceIdentifier: string;
  now: Date;
  orderIndex: number;
  resolveProductMatch: StoreProductMatcher;
}): Promise<ShoppingItemUpsertInput> {
  const match = await input.resolveProductMatch(input.rawText);
  const matched = match.state === "matched";

  return {
    shoppingListId: input.list.id,
    rawText: input.rawText,
    normalizedText: normalizeProductText(input.rawText),
    productConceptId: matched ? match.productConcept.id : null,
    orderKey: createOrderKey(
      input.now,
      input.orderIndex,
      input.sourceIdentifier,
    ),
    sourceIdentifier: input.sourceIdentifier,
    mutationId: input.mutationId,
    now: input.now,
  };
}

async function batchShoppingItemUpserts(
  db: Database,
  inputs: ShoppingItemUpsertInput[],
) {
  const queries = inputs.map((input) =>
    buildShoppingItemUpsertQuery(db, input),
  );

  if (queries.length === 0) {
    return;
  }

  await db.batch(
    queries as [(typeof queries)[number], ...Array<(typeof queries)[number]>],
  );
}

async function readShoppingListPayload(
  db: Database,
  store: StoreSummary | null,
  list: ShoppingList,
  view: ShoppingListView,
): Promise<ActiveShoppingListPayload> {
  const now = new Date();
  const storeId = store?.id ?? null;
  const rows =
    view === "completed"
      ? await buildCompletedShoppingItemsQuery(db, storeId, list.id, now)
      : view === "snoozed"
        ? await buildSnoozedShoppingItemsQuery(db, storeId, list.id, now)
        : await buildRouteOrderedShoppingItemsQuery(db, storeId, list.id, now);

  return {
    store: store
      ? {
          id: store.id,
          name: store.name,
        }
      : null,
    list: {
      id: list.id,
      source: list.source,
    },
    items: (rows as RouteOrderedShoppingItemRow[]).map(toItemPayload),
  };
}

function toItemPayload({
  aisle,
  aisleSection,
  item,
  productConcept,
  productLocation,
}: RouteOrderedShoppingItemRow): ActiveShoppingItemPayload {
  const location =
    productLocation && aisleSection && aisle
      ? {
          id: productLocation.id,
          aisleSectionId: productLocation.aisleSectionId,
          positionWithinSection: productLocation.positionWithinSection,
          confidence: productLocation.confidence,
          source: productLocation.source,
          aisleSection: {
            id: aisleSection.id,
            aisleId: aisle.id,
            aisleIdentifier: aisle.identifier,
            aisleDisplayName: aisle.displayName,
            label: aisleSection.label,
            pathOrder: aisleSection.pathOrder,
            side: aisleSection.side,
          },
        }
      : null;

  return {
    id: item.id,
    rawText: item.rawText,
    normalizedText: item.normalizedText,
    isChecked: item.isChecked,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    snoozedUntil: item.snoozedUntil?.toISOString() ?? null,
    resolutionState: location
      ? "route-resolved"
      : productConcept
        ? "matched-unlocated"
        : "needs-correction",
    productConcept: productConcept
      ? {
          id: productConcept.id,
          canonicalName: productConcept.canonicalName,
          normalizedName: productConcept.normalizedName,
        }
      : null,
    location,
  };
}

function createOrderKey(
  now: Date,
  orderIndex: number,
  sourceIdentifier: string,
) {
  return `${String(now.getTime()).padStart(13, "0")}:${String(orderIndex).padStart(4, "0")}:${sourceIdentifier}`;
}

function deterministicUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
