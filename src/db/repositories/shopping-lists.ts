import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import type { Database } from "../create-client";
import {
  aisles,
  aisleSections,
  productAliases,
  productConcepts,
  productLocations,
  shoppingItems,
  shoppingLists,
} from "../schema";

export interface ShoppingItemUpsertInput {
  storeId: string;
  shoppingListId: string;
  rawText: string;
  normalizedText: string;
  productConceptId: string | null;
  resolvedLocationId: string | null;
  orderKey: string;
  sourceIdentifier: string;
  mutationId: string;
  now?: Date;
}

export interface ShoppingItemCheckStateInput {
  storeId: string;
  shoppingListId: string;
  itemId: string;
  isChecked: boolean;
  now?: Date;
}

export interface ShoppingItemNormalizedTextLookupInput {
  storeId: string;
  shoppingListId: string;
  normalizedTexts: string[];
}

export function buildActiveShoppingListQuery(db: Database, storeId: string) {
  return db
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.storeId, storeId),
        eq(shoppingLists.state, "active"),
      ),
    )
    .limit(1);
}

export function buildActiveShoppingListCreateQuery(
  db: Database,
  storeId: string,
) {
  return db
    .insert(shoppingLists)
    .values({
      storeId,
      source: "manual",
      state: "active",
      syncState: "synced",
    })
    .onConflictDoUpdate({
      target: shoppingLists.storeId,
      targetWhere: sql`${shoppingLists.state} = 'active'`,
      set: {
        updatedAt: sql`${shoppingLists.updatedAt}`,
      },
    })
    .returning();
}

export function buildRouteOrderedShoppingItemsQuery(
  db: Database,
  storeId: string,
  shoppingListId: string,
) {
  return db
    .select({
      item: shoppingItems,
      productConcept: productConcepts,
      productLocation: productLocations,
      aisleSection: aisleSections,
      aisle: aisles,
    })
    .from(shoppingItems)
    .leftJoin(
      productConcepts,
      eq(shoppingItems.productConceptId, productConcepts.id),
    )
    .leftJoin(
      productLocations,
      and(
        eq(shoppingItems.resolvedLocationId, productLocations.id),
        eq(shoppingItems.storeId, productLocations.storeId),
      ),
    )
    .leftJoin(
      aisleSections,
      and(
        eq(productLocations.aisleSectionId, aisleSections.id),
        eq(productLocations.storeId, aisleSections.storeId),
      ),
    )
    .leftJoin(
      aisles,
      and(
        eq(aisleSections.aisleId, aisles.id),
        eq(aisleSections.storeId, aisles.storeId),
      ),
    )
    .where(
      and(
        eq(shoppingItems.shoppingListId, shoppingListId),
        eq(shoppingItems.storeId, storeId),
      ),
    )
    .orderBy(
      asc(
        sql<number>`case when ${aisleSections.pathOrder} is null then 1 else 0 end`,
      ),
      asc(aisleSections.pathOrder),
      asc(
        sql<number>`coalesce(${productLocations.positionWithinSection}, 2147483647)`,
      ),
      asc(shoppingItems.orderKey),
      asc(shoppingItems.createdAt),
    );
}

export function buildShoppingItemUpsertQuery(
  db: Database,
  input: ShoppingItemUpsertInput,
) {
  const now = input.now ?? new Date();

  return db
    .insert(shoppingItems)
    .values({
      storeId: input.storeId,
      shoppingListId: input.shoppingListId,
      rawText: input.rawText,
      normalizedText: input.normalizedText,
      productConceptId: input.productConceptId,
      resolvedLocationId: input.resolvedLocationId,
      orderKey: input.orderKey,
      sourceIdentifier: input.sourceIdentifier,
      syncState: "synced",
      mutationId: input.mutationId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [shoppingItems.shoppingListId, shoppingItems.sourceIdentifier],
      targetWhere: sql`${shoppingItems.sourceIdentifier} IS NOT NULL`,
      set: {
        updatedAt: sql`${shoppingItems.updatedAt}`,
      },
    })
    .returning();
}

export function buildShoppingItemCheckStateQuery(
  db: Database,
  input: ShoppingItemCheckStateInput,
) {
  const now = input.now ?? new Date();

  return db
    .update(shoppingItems)
    .set({
      isChecked: input.isChecked,
      checkedAt: input.isChecked
        ? sql`coalesce(${shoppingItems.checkedAt}, ${now})`
        : null,
      updatedAt: sql`case when ${shoppingItems.isChecked} = ${input.isChecked} then ${shoppingItems.updatedAt} else ${now} end`,
      version: sql`case when ${shoppingItems.isChecked} = ${input.isChecked} then ${shoppingItems.version} else ${shoppingItems.version} + 1 end`,
    })
    .where(
      and(
        eq(shoppingItems.storeId, input.storeId),
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        eq(shoppingItems.id, input.itemId),
      ),
    )
    .returning();
}

export function buildShoppingItemsByNormalizedTextQuery(
  db: Database,
  input: ShoppingItemNormalizedTextLookupInput,
) {
  return db
    .select({
      id: shoppingItems.id,
      rawText: shoppingItems.rawText,
      normalizedText: shoppingItems.normalizedText,
      sourceIdentifier: shoppingItems.sourceIdentifier,
    })
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.storeId, input.storeId),
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        inArray(shoppingItems.normalizedText, input.normalizedTexts),
      ),
    );
}

export function buildExactProductAliasLookupQuery(
  db: Database,
  storeId: string,
  normalizedText: string,
) {
  return db
    .select({
      alias: productAliases,
      productConcept: productConcepts,
    })
    .from(productAliases)
    .innerJoin(
      productConcepts,
      eq(productAliases.productConceptId, productConcepts.id),
    )
    .where(
      and(
        eq(productAliases.normalizedText, normalizedText),
        or(
          eq(productAliases.source, "learned"),
          eq(productAliases.source, "imported"),
        ),
        or(
          eq(productAliases.scope, "global"),
          and(
            eq(productAliases.scope, "store"),
            eq(productAliases.storeId, storeId),
          ),
        ),
      ),
    )
    .orderBy(
      desc(productAliases.isCorrection),
      desc(
        sql<number>`case when ${productAliases.scope} = 'store' then 1 else 0 end`,
      ),
      desc(productAliases.confidence),
    )
    .limit(1);
}

export async function findExactProductAlias(
  db: Database,
  storeId: string,
  normalizedText: string,
) {
  const [match] = await buildExactProductAliasLookupQuery(
    db,
    storeId,
    normalizedText,
  );

  return match ?? null;
}

export function buildProductLocationLookupQuery(
  db: Database,
  storeId: string,
  productConceptId: string,
) {
  return db
    .select({
      location: productLocations,
      aisleSection: aisleSections,
    })
    .from(productLocations)
    .innerJoin(
      aisleSections,
      eq(productLocations.aisleSectionId, aisleSections.id),
    )
    .where(
      and(
        eq(productLocations.storeId, storeId),
        eq(productLocations.productConceptId, productConceptId),
      ),
    )
    .limit(1);
}

export async function findProductLocation(
  db: Database,
  storeId: string,
  productConceptId: string,
) {
  const [location] = await buildProductLocationLookupQuery(
    db,
    storeId,
    productConceptId,
  );

  return location ?? null;
}
