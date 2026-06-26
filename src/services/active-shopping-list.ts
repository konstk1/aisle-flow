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
import type { StoreLayout } from "@/domain/store-layout";

import { getDb } from "@/db/client";
import type { Database } from "@/db/create-client";
import {
  buildActiveShoppingListCreateQuery,
  buildActiveShoppingListQuery,
  buildCompletedShoppingItemsQuery,
  buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery,
  buildShoppingItemDeleteQuery,
  buildShoppingItemTextUpdateQuery,
  buildShoppingItemsByNormalizedTextQuery,
  buildShoppingItemUpsertQuery,
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
import { getStoreLayout } from "./store-layout";

const mutationIdSchema = z.uuid("Provide a valid mutation id.");
const duplicateShoppingItemMessage = "This item is already on the list.";

export type ShoppingListView = "active" | "completed";

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
    text: shoppingItemTextSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const updateCount =
      Number(input.isChecked !== undefined) + Number(input.text !== undefined);

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

export async function getActiveShoppingList(): Promise<ActiveShoppingListPayload> {
  const layout = await requireActiveStoreLayout();

  return getActiveShoppingListForLayout(layout);
}

export async function getActiveShoppingListForLayout(
  layout: StoreLayout,
): Promise<ActiveShoppingListPayload> {
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);

  return readShoppingListPayload(db, layout, list, "active");
}

export async function getCompletedShoppingList(): Promise<ActiveShoppingListPayload | null> {
  const layout = await requireActiveStoreLayout();

  return getCompletedShoppingListForLayout(layout);
}

export async function getCompletedShoppingListForLayout(
  layout: StoreLayout,
): Promise<ActiveShoppingListPayload | null> {
  const db = getDb();
  const [list] = await buildActiveShoppingListQuery(db, layout.id);

  if (!list) {
    return null;
  }

  return readShoppingListPayload(db, layout, list, "completed");
}

export async function addActiveShoppingListItem(
  input: ActiveShoppingItemCreateRequest,
): Promise<ActiveShoppingListPayload> {
  const layout = await requireActiveStoreLayout();
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);
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
    storeId: layout.id,
  });
  const resolveProductMatch = await createStoreProductMatcher({
    db,
    storeId: layout.id,
  });

  await persistShoppingItem(db, {
    layout,
    list,
    mutationId: input.mutationId,
    now,
    orderIndex: 0,
    rawText: input.text,
    resolveProductMatch,
    sourceIdentifier,
  });

  return readShoppingListPayload(db, layout, list, "active");
}

export async function importActiveShoppingListItems(
  input: ActiveShoppingListImportRequest,
): Promise<ActiveShoppingListPayload> {
  const parsed = parseShoppingItemImportLines(input.text);

  if (!parsed.success) {
    throw new ActiveShoppingListRequestError(
      "Check the highlighted import field.",
      parsed.fieldErrors,
    );
  }

  const layout = await requireActiveStoreLayout();
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);
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
    storeId: layout.id,
  });
  const resolveProductMatch = await createStoreProductMatcher({
    db,
    storeId: layout.id,
  });

  const upsertInputs = await Promise.all(
    parsed.lines.map((line, index) => {
      const sourceIdentifier = `import:${input.mutationId}:${index}`;

      return buildShoppingItemUpsertInput({
        layout,
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

  return readShoppingListPayload(db, layout, list, "active");
}

export async function setActiveShoppingItemChecked({
  itemId,
  isChecked,
  responseView = "active",
}: {
  itemId: string;
  isChecked: boolean;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const layout = await requireActiveStoreLayout();
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);
  const [updatedItem] = await buildShoppingItemCheckStateQuery(db, {
    storeId: layout.id,
    shoppingListId: list.id,
    itemId,
    isChecked,
  });

  if (!updatedItem) {
    throw new ActiveShoppingListRequestError(
      "Choose an item in the active list.",
      { itemId: ["Choose an item in the active list."] },
      404,
    );
  }

  return readShoppingListPayload(db, layout, list, responseView);
}

export async function updateActiveShoppingItemText({
  itemId,
  text,
  responseView = "active",
}: {
  itemId: string;
  text: string;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const layout = await requireActiveStoreLayout();
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);
  const normalizedText = normalizeProductText(text);
  await ensureShoppingItemTextIsAvailable(db, {
    currentItemId: itemId,
    list,
    normalizedText,
    storeId: layout.id,
  });
  const resolveProductMatch = await createStoreProductMatcher({
    db,
    storeId: layout.id,
  });
  const match = await resolveProductMatch(text);
  const matched = match.state === "matched";
  const [updatedItem] = await buildShoppingItemTextUpdateQuery(db, {
    storeId: layout.id,
    shoppingListId: list.id,
    itemId,
    rawText: text,
    normalizedText,
    productConceptId: matched ? match.productConcept.id : null,
    resolvedLocationId: matched ? (match.location?.id ?? null) : null,
  });

  if (!updatedItem) {
    throw new ActiveShoppingListRequestError(
      "Choose an item in the active list.",
      { itemId: ["Choose an item in the active list."] },
      404,
    );
  }

  return readShoppingListPayload(db, layout, list, responseView);
}

export async function deleteActiveShoppingItem({
  itemId,
  responseView = "active",
}: {
  itemId: string;
  responseView?: ShoppingListView;
}): Promise<ActiveShoppingListPayload> {
  const layout = await requireActiveStoreLayout();
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);
  const [deletedItem] = await buildShoppingItemDeleteQuery(db, {
    storeId: layout.id,
    shoppingListId: list.id,
    itemId,
  });

  if (!deletedItem) {
    throw new ActiveShoppingListRequestError(
      "Choose an item in the active list.",
      { itemId: ["Choose an item in the active list."] },
      404,
    );
  }

  return readShoppingListPayload(db, layout, list, responseView);
}

async function requireActiveStoreLayout(): Promise<StoreLayout> {
  const layout = await getStoreLayout();

  if (!layout) {
    throw new ActiveShoppingListRequestError(
      "Create and save a store layout before adding shopping items.",
      {
        form: ["Create and save a store layout before adding shopping items."],
      },
      409,
    );
  }

  return layout;
}

async function getOrCreateActiveShoppingList(
  db: Database,
  storeId: string,
): Promise<ShoppingList> {
  const [existing] = await buildActiveShoppingListQuery(db, storeId);

  if (existing) {
    return existing;
  }

  const [created] = await buildActiveShoppingListCreateQuery(db, storeId);

  if (created) {
    return created;
  }

  throw new Error("Active shopping list could not be created.");
}

async function persistShoppingItem(
  db: Database,
  input: {
    layout: StoreLayout;
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
    storeId: string;
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
    storeId: input.storeId,
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
    storeId: string;
    list: ShoppingList;
    currentItemId: string;
    normalizedText: string;
  },
) {
  const existingItems = await buildShoppingItemsByNormalizedTextQuery(db, {
    storeId: input.storeId,
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
  layout: StoreLayout;
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
    storeId: input.layout.id,
    shoppingListId: input.list.id,
    rawText: input.rawText,
    normalizedText: normalizeProductText(input.rawText),
    productConceptId: matched ? match.productConcept.id : null,
    resolvedLocationId: matched ? (match.location?.id ?? null) : null,
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
  layout: StoreLayout,
  list: ShoppingList,
  view: ShoppingListView,
): Promise<ActiveShoppingListPayload> {
  const rows =
    view === "completed"
      ? await buildCompletedShoppingItemsQuery(db, layout.id, list.id)
      : await buildRouteOrderedShoppingItemsQuery(db, layout.id, list.id);

  return {
    store: {
      id: layout.id,
      name: layout.name,
    },
    list: {
      id: list.id,
      source: list.source,
      syncState: list.syncState,
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
    syncState: item.syncState,
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
