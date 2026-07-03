import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

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

const shoppingItemRouteSelection = {
  item: shoppingItems,
  productConcept: productConcepts,
  productLocation: productLocations,
  aisleSection: aisleSections,
  aisle: aisles,
};

// Locations are resolved at read time against the viewer's current store, so
// the same list routes differently per store. No store means no locations.
function buildShoppingItemRouteRowsQuery(db: Database, storeId: string | null) {
  return db
    .select(shoppingItemRouteSelection)
    .from(shoppingItems)
    .leftJoin(
      productConcepts,
      eq(shoppingItems.productConceptId, productConcepts.id),
    )
    .leftJoin(
      productLocations,
      storeId
        ? and(
            eq(productLocations.productConceptId, shoppingItems.productConceptId),
            eq(productLocations.storeId, storeId),
          )
        : sql`false`,
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
    );
}

export interface ShoppingItemUpsertInput {
  shoppingListId: string;
  rawText: string;
  normalizedText: string;
  productConceptId: string | null;
  orderKey: string;
  sourceIdentifier: string;
  mutationId: string;
  now?: Date;
}

export interface ShoppingItemCheckStateInput {
  shoppingListId: string;
  itemId: string;
  isChecked: boolean;
  now?: Date;
}

export interface ShoppingItemSnoozeStateInput {
  shoppingListId: string;
  itemId: string;
  snoozedUntil: Date | null;
  now?: Date;
}

export interface ShoppingItemTextUpdateInput {
  shoppingListId: string;
  itemId: string;
  rawText: string;
  normalizedText: string;
  productConceptId: string | null;
  now?: Date;
}

export interface ShoppingItemDeleteInput {
  shoppingListId: string;
  itemId: string;
}

export interface ShoppingItemProductResolutionInput {
  shoppingListId: string;
  normalizedText: string;
  productConceptId: string | SQL;
  now?: Date;
}

export interface ShoppingItemNormalizedTextLookupInput {
  shoppingListId: string;
  normalizedTexts: string[];
}

export function buildActiveShoppingListQuery(db: Database, userId: string) {
  return db
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.userId, userId),
        eq(shoppingLists.state, "active"),
      ),
    )
    .limit(1);
}

export function buildActiveShoppingListCreateQuery(
  db: Database,
  userId: string,
) {
  return db
    .insert(shoppingLists)
    .values({
      userId,
      source: "manual",
      state: "active",
    })
    .onConflictDoUpdate({
      target: [shoppingLists.userId],
      targetWhere: sql`${shoppingLists.state} = 'active'`,
      set: {
        updatedAt: sql`${shoppingLists.updatedAt}`,
      },
    })
    .returning();
}

export function buildRouteOrderedShoppingItemsQuery(
  db: Database,
  storeId: string | null,
  shoppingListId: string,
  now: Date,
) {
  return buildShoppingItemRouteRowsQuery(db, storeId)
    .where(
      and(
        eq(shoppingItems.shoppingListId, shoppingListId),
        eq(shoppingItems.isChecked, false),
        or(
          isNull(shoppingItems.snoozedUntil),
          lte(shoppingItems.snoozedUntil, now),
        ),
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

export function buildCompletedShoppingItemsQuery(
  db: Database,
  storeId: string | null,
  shoppingListId: string,
) {
  return buildShoppingItemRouteRowsQuery(db, storeId)
    .where(
      and(
        eq(shoppingItems.shoppingListId, shoppingListId),
        eq(shoppingItems.isChecked, true),
      ),
    )
    .orderBy(
      desc(shoppingItems.checkedAt),
      desc(shoppingItems.updatedAt),
      desc(shoppingItems.createdAt),
    );
}

export function buildSnoozedShoppingItemsQuery(
  db: Database,
  storeId: string | null,
  shoppingListId: string,
  now: Date,
) {
  return buildShoppingItemRouteRowsQuery(db, storeId)
    .where(
      and(
        eq(shoppingItems.shoppingListId, shoppingListId),
        eq(shoppingItems.isChecked, false),
        isNotNull(shoppingItems.snoozedUntil),
        gt(shoppingItems.snoozedUntil, now),
      ),
    )
    .orderBy(
      asc(shoppingItems.snoozedUntil),
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
      shoppingListId: input.shoppingListId,
      rawText: input.rawText,
      normalizedText: input.normalizedText,
      productConceptId: input.productConceptId,
      orderKey: input.orderKey,
      sourceIdentifier: input.sourceIdentifier,
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
      snoozedUntil: sql`case when ${shoppingItems.isChecked} = ${input.isChecked} then ${shoppingItems.snoozedUntil} else null end`,
      updatedAt: sql`case when ${shoppingItems.isChecked} = ${input.isChecked} then ${shoppingItems.updatedAt} else ${now} end`,
      version: sql`case when ${shoppingItems.isChecked} = ${input.isChecked} then ${shoppingItems.version} else ${shoppingItems.version} + 1 end`,
    })
    .where(
      and(
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        eq(shoppingItems.id, input.itemId),
      ),
    )
    .returning();
}

export function buildShoppingItemSnoozeStateQuery(
  db: Database,
  input: ShoppingItemSnoozeStateInput,
) {
  const now = input.now ?? new Date();
  const snoozedUntil = input.snoozedUntil;

  return db
    .update(shoppingItems)
    .set({
      snoozedUntil,
      updatedAt: now,
      version: sql`${shoppingItems.version} + 1`,
    })
    .where(
      and(
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        eq(shoppingItems.id, input.itemId),
        eq(shoppingItems.isChecked, false),
      ),
    )
    .returning();
}

export function buildShoppingItemTextUpdateQuery(
  db: Database,
  input: ShoppingItemTextUpdateInput,
) {
  const now = input.now ?? new Date();

  return db
    .update(shoppingItems)
    .set({
      rawText: input.rawText,
      normalizedText: input.normalizedText,
      productConceptId: input.productConceptId,
      updatedAt: now,
      version: sql`${shoppingItems.version} + 1`,
    })
    .where(
      and(
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        eq(shoppingItems.id, input.itemId),
      ),
    )
    .returning();
}

export function buildShoppingItemDeleteQuery(
  db: Database,
  input: ShoppingItemDeleteInput,
) {
  return db
    .delete(shoppingItems)
    .where(
      and(
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        eq(shoppingItems.id, input.itemId),
      ),
    )
    .returning();
}

export function buildShoppingItemProductResolutionQuery(
  db: Database,
  input: ShoppingItemProductResolutionInput,
) {
  const now = input.now ?? new Date();

  return db
    .update(shoppingItems)
    .set({
      productConceptId: input.productConceptId,
      updatedAt: now,
      version: sql`${shoppingItems.version} + 1`,
    })
    .where(
      and(
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        eq(shoppingItems.normalizedText, input.normalizedText),
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
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        inArray(shoppingItems.normalizedText, input.normalizedTexts),
      ),
    );
}

// Which aliases are visible for a (possibly absent) store: global aliases
// always, plus the store's own when one is selected.
export function productAliasStoreScopeFilter(storeId: string | null): SQL {
  const globalScope = eq(productAliases.scope, "global");

  if (!storeId) {
    return globalScope;
  }

  return or(
    globalScope,
    and(
      eq(productAliases.scope, "store"),
      eq(productAliases.storeId, storeId),
    ),
  ) as SQL;
}

export function buildExactProductAliasLookupQuery(
  db: Database,
  storeId: string | null,
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
        productAliasStoreScopeFilter(storeId),
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
  storeId: string | null,
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
