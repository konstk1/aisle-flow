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
  buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery,
  buildShoppingItemUpsertQuery,
} from "@/db/repositories/shopping-lists";
import type {
  Aisle,
  AisleSection,
  ProductConcept,
  ProductLocation,
  ShoppingItem,
  ShoppingList,
} from "@/db/schema";

import { resolveProductMatchForStore } from "./product-matching";
import { getStoreLayout } from "./store-layout";

const mutationIdSchema = z.uuid("Provide a valid mutation id.");

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

export const activeShoppingItemCheckRequestSchema = z.object({
  isChecked: z.boolean(),
});

export type ActiveShoppingItemCreateRequest = z.output<
  typeof activeShoppingItemCreateRequestSchema
>;

export type ActiveShoppingListImportRequest = z.output<
  typeof activeShoppingListImportRequestSchema
>;

export type ActiveShoppingItemCheckRequest = z.output<
  typeof activeShoppingItemCheckRequestSchema
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
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);

  return readActiveShoppingListPayload(db, layout, list);
}

export async function addActiveShoppingListItem(
  input: ActiveShoppingItemCreateRequest,
): Promise<ActiveShoppingListPayload> {
  const layout = await requireActiveStoreLayout();
  const db = getDb();
  const list = await getOrCreateActiveShoppingList(db, layout.id);
  const now = new Date();

  await persistShoppingItem(db, {
    layout,
    list,
    mutationId: input.mutationId,
    now,
    orderIndex: 0,
    rawText: input.text,
    sourceIdentifier: `manual:${input.mutationId}`,
  });

  return readActiveShoppingListPayload(db, layout, list);
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

  for (const [index, line] of parsed.lines.entries()) {
    const sourceIdentifier = `import:${input.mutationId}:${index}`;

    await persistShoppingItem(db, {
      layout,
      list,
      mutationId: deterministicUuid(sourceIdentifier),
      now,
      orderIndex: index,
      rawText: line.rawText,
      sourceIdentifier,
    });
  }

  return readActiveShoppingListPayload(db, layout, list);
}

export async function setActiveShoppingItemChecked({
  itemId,
  isChecked,
}: {
  itemId: string;
  isChecked: boolean;
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

  return readActiveShoppingListPayload(db, layout, list);
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

  const [fallback] = await buildActiveShoppingListQuery(db, storeId);

  if (!fallback) {
    throw new Error("Active shopping list could not be created.");
  }

  return fallback;
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
  },
) {
  const match = await resolveProductMatchForStore({
    storeId: input.layout.id,
    text: input.rawText,
  });
  const matched = match.state === "matched";

  await buildShoppingItemUpsertQuery(db, {
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
  });
}

async function readActiveShoppingListPayload(
  db: Database,
  layout: StoreLayout,
  list: ShoppingList,
): Promise<ActiveShoppingListPayload> {
  const rows = await buildRouteOrderedShoppingItemsQuery(
    db,
    layout.id,
    list.id,
  );

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
  const hasRouteLocation = Boolean(
    productConcept && productLocation && aisleSection && aisle,
  );

  return {
    id: item.id,
    rawText: item.rawText,
    normalizedText: item.normalizedText,
    isChecked: item.isChecked,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    syncState: item.syncState,
    resolutionState: hasRouteLocation
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
    location:
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
        : null,
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
