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
import {
  deriveProductCategorizationReviewState,
  MAX_SHOPPING_ITEM_QUANTITY_LENGTH,
  type ProductCategorizationSource,
} from "@/domain/product-categorization";
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
  buildShoppingItemQuantityUpdateQuery,
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

import { categorizeSubmittedProducts } from "./product-categorization";
import { createStoreProductMatcher } from "./product-matching";
import { resolveCurrentStore } from "./stores";

const mutationIdSchema = z.uuid("Provide a valid mutation id.");
const duplicateShoppingItemMessage = "This item is already on the list.";

export const SNOOZE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

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

export const activeShoppingListImportRequestSchema = z.object({
  text: z.string(),
  mutationId: mutationIdSchema,
  categorizationMode: z.enum(["ai", "deterministic"]).default("ai"),
});

const shoppingItemQuantitySchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length <= MAX_SHOPPING_ITEM_QUANTITY_LENGTH, {
    message: `Quantity must be ${MAX_SHOPPING_ITEM_QUANTITY_LENGTH} characters or fewer.`,
  })
  .transform((value) => value || null)
  .nullable();

export const activeShoppingItemUpdateRequestSchema = z
  .object({
    isChecked: z.boolean().optional(),
    snoozed: z.boolean().optional(),
    text: shoppingItemTextSchema.optional(),
    quantityText: shoppingItemQuantitySchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const detailUpdate =
      input.text !== undefined || input.quantityText !== undefined;
    const updateCount =
      Number(input.isChecked !== undefined) +
      Number(input.snoozed !== undefined) +
      Number(detailUpdate);

    if (updateCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Send exactly one item update.",
        path: ["form"],
      });
    }
  });

export type ActiveShoppingListImportRequest = z.input<
  typeof activeShoppingListImportRequestSchema
>;

export type ActiveShoppingListImportResult = {
  activeList: ActiveShoppingListPayload;
  alreadyOnList: string[];
  updatedQuantities: string[];
};

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
  | StoreSummary
  | null
  | Promise<StoreSummary | null>;

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

export async function importActiveShoppingListItems(
  userId: string,
  input: ActiveShoppingListImportRequest,
): Promise<ActiveShoppingListImportResult> {
  const parsed = parseShoppingItemImportLines(input.text);

  if (!parsed.success) {
    throw new ActiveShoppingListRequestError(
      "Check the highlighted import field.",
      parsed.fieldErrors,
    );
  }

  const {
    db,
    store,
    storeId,
    list: existingList,
  } = await loadShoppingListContext(userId, findActiveShoppingList);
  const now = new Date();
  const uniqueLines = parsed.lines.filter(
    (line, index, lines) =>
      lines.findIndex((candidate) => candidate.rawText === line.rawText) ===
      index,
  );
  const submittedItems = uniqueLines.map((line, index) => ({
    ...line,
    index,
    sourceIdentifier: `import:${input.mutationId}:${index}`,
  }));
  const categorizations = await categorizeSubmittedProducts({
    db,
    items: submittedItems.map((item) => ({
      key: item.sourceIdentifier,
      submittedText: item.rawText,
    })),
    mode: input.categorizationMode ?? "ai",
    storeId,
    userId,
  });
  const submittedByKey = new Map(
    submittedItems.map((item) => [item.sourceIdentifier, item]),
  );
  const categorizedItems = consolidateImportItems(
    categorizations.map((categorization) => {
      const submitted = submittedByKey.get(categorization.key);

      if (!submitted) {
        throw new Error("Categorization returned an unknown submitted item.");
      }

      return {
        ...categorization,
        index: submitted.index,
        normalizedText: normalizeProductText(categorization.itemName),
        sourceIdentifier: submitted.sourceIdentifier,
      };
    }),
  );
  const list =
    existingList ?? (await getOrCreateActiveShoppingList(db, userId));
  const existingItems = await buildShoppingItemsByNormalizedTextQuery(db, {
    shoppingListId: list.id,
    normalizedTexts: [
      ...new Set(categorizedItems.map((item) => item.normalizedText)),
    ],
  });
  const { alreadyOnList, itemsToAdd, quantityUpdates, updatedQuantities } =
    partitionImportItems(categorizedItems, existingItems);

  const upsertInputs = itemsToAdd.map((item) =>
    buildShoppingItemUpsertInput({
      item,
      list,
      mutationId: deterministicUuid(item.sourceIdentifier),
      now,
    }),
  );

  await executeImportWrites(db, list.id, now, upsertInputs, quantityUpdates);

  return {
    activeList: await readShoppingListPayload(db, store, list, "active"),
    alreadyOnList,
    updatedQuantities,
  };
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
  quantityText,
  responseView = "active",
}: {
  userId: string;
  itemId: string;
  text: string;
  quantityText?: string | null;
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
    userId,
    storeId,
  });
  const match = await resolveProductMatch(text);
  const matched = match.state === "matched";
  const [updatedItem] = await buildShoppingItemTextUpdateQuery(db, {
    shoppingListId: list.id,
    itemId,
    rawText: text,
    normalizedText,
    quantityText,
    productConceptId: matched ? match.productConcept.id : null,
    categorizationConfidence: match.confidence,
    categorizationSource:
      matched && match.source === "learned-alias"
        ? "learned-alias"
        : "deterministic",
  });

  if (!updatedItem) {
    throw activeShoppingItemNotFoundError();
  }

  return readShoppingListPayload(db, store, list, responseView);
}

export async function updateActiveShoppingItemQuantity({
  userId,
  itemId,
  quantityText,
  responseView = "active",
}: {
  userId: string;
  itemId: string;
  quantityText: string | null;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const { db, store, list } = await loadShoppingListContext(
    userId,
    findActiveShoppingList,
  );

  if (!list) {
    throw activeShoppingItemNotFoundError();
  }

  const [updatedItem] = await buildShoppingItemQuantityUpdateQuery(db, {
    shoppingListId: list.id,
    itemId,
    quantityText,
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

type ImportItemCandidate = {
  index: number;
  itemName: string;
  normalizedText: string;
  quantityText: string | null;
  productConceptId: string | null;
  confidence: number | null;
  source: ProductCategorizationSource;
  suggestedProductConceptName: string | null;
  sourceIdentifier: string;
};

function consolidateImportItems(items: ImportItemCandidate[]) {
  const consolidated = new Map<string, ImportItemCandidate>();

  for (const item of items) {
    const existing = consolidated.get(item.normalizedText);

    if (existing) {
      existing.quantityText = item.quantityText;
    } else {
      consolidated.set(item.normalizedText, { ...item });
    }
  }

  return [...consolidated.values()];
}

function partitionImportItems(
  normalizedItems: ImportItemCandidate[],
  existingItems: Array<{
    id: string;
    rawText: string;
    normalizedText: string;
    quantityText: string | null;
    sourceIdentifier: string | null;
  }>,
) {
  const seenByNormalizedText = new Map(
    existingItems.map((item) => [item.normalizedText, item]),
  );
  const alreadyOnListByNormalizedText = new Map<string, string>();
  const updatedQuantitiesByNormalizedText = new Map<string, string>();
  const itemsToAdd: ImportItemCandidate[] = [];
  const quantityUpdates: Array<{
    itemId: string;
    quantityText: string | null;
  }> = [];

  for (const item of normalizedItems) {
    const existing = seenByNormalizedText.get(item.normalizedText);

    // A retry of the same mutation should still reach the idempotent upsert.
    if (existing?.sourceIdentifier === item.sourceIdentifier) {
      itemsToAdd.push(item);
      continue;
    }

    if (existing) {
      if (existing.quantityText !== item.quantityText) {
        quantityUpdates.push({
          itemId: existing.id,
          quantityText: item.quantityText,
        });
        updatedQuantitiesByNormalizedText.set(
          item.normalizedText,
          existing.rawText,
        );
      } else {
        alreadyOnListByNormalizedText.set(
          item.normalizedText,
          existing.rawText,
        );
      }
      continue;
    }

    itemsToAdd.push(item);
  }

  return {
    alreadyOnList: [...alreadyOnListByNormalizedText.values()],
    itemsToAdd,
    quantityUpdates,
    updatedQuantities: [...updatedQuantitiesByNormalizedText.values()],
  };
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

function buildShoppingItemUpsertInput(input: {
  item: ImportItemCandidate;
  list: ShoppingList;
  mutationId: string;
  now: Date;
}): ShoppingItemUpsertInput {
  return {
    shoppingListId: input.list.id,
    rawText: input.item.itemName,
    normalizedText: input.item.normalizedText,
    quantityText: input.item.quantityText,
    productConceptId: input.item.productConceptId,
    categorizationConfidence: input.item.confidence,
    categorizationSource: input.item.source,
    suggestedProductConceptName: input.item.suggestedProductConceptName,
    orderKey: createOrderKey(
      input.now,
      input.item.index,
      input.item.sourceIdentifier,
    ),
    sourceIdentifier: input.item.sourceIdentifier,
    mutationId: input.mutationId,
    now: input.now,
  };
}

async function executeImportWrites(
  db: Database,
  shoppingListId: string,
  now: Date,
  upserts: ShoppingItemUpsertInput[],
  quantityUpdates: Array<{ itemId: string; quantityText: string | null }>,
) {
  const queries = [
    ...upserts.map((input) => buildShoppingItemUpsertQuery(db, input)),
    ...quantityUpdates.map((update) =>
      buildShoppingItemQuantityUpdateQuery(db, {
        shoppingListId,
        itemId: update.itemId,
        quantityText: update.quantityText,
        now,
      }),
    ),
  ];

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
    quantityText: item.quantityText,
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
    categorization: {
      source: item.categorizationSource,
      confidence: item.categorizationConfidence,
      reviewState: deriveProductCategorizationReviewState({
        confidence: item.categorizationConfidence,
        source: item.categorizationSource,
        suggestedConceptName: item.suggestedProductConceptName,
      }),
      suggestedConceptName: item.suggestedProductConceptName,
    },
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
