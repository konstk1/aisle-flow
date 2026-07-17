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

import { checkedItemRetentionCutoff } from "@/domain/active-shopping-list";

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

// A product_locations join predicate that matches the given store, or matches
// no rows when there is no current store. Combine with the concept-id equality
// inside the join's `and(...)`.
export function productLocationStoreFilter(storeId: string | null): SQL {
  return storeId === null ? sql`false` : eq(productLocations.storeId, storeId);
}

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
      and(
        eq(productLocations.productConceptId, shoppingItems.productConceptId),
        productLocationStoreFilter(storeId),
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
    );
}

export interface ShoppingItemUpsertInput {
  shoppingListId: string;
  rawText: string;
  normalizedText: string;
  quantityText?: string | null;
  productConceptId: string | null;
  categorizationSource?: "learned-alias" | "llm" | "deterministic" | "manual";
  suggestedProductConceptName?: string | null;
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
  quantityText?: string | null;
  productConceptId: string | null;
  categorizationSource?: "learned-alias" | "deterministic";
  now?: Date;
}

export interface ShoppingItemQuantityUpdateInput {
  shoppingListId: string;
  itemId: string;
  quantityText: string | null;
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

export interface AutomaticProductAliasInput {
  userId: string;
  productConceptId: string;
  normalizedText: string;
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
      and(eq(shoppingLists.userId, userId), eq(shoppingLists.state, "active")),
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
        // Recently checked items stay visible (struck through) so the trip's
        // progress keeps tallying them; checkedAt is NULL while unchecked.
        or(
          eq(shoppingItems.isChecked, false),
          gt(shoppingItems.checkedAt, checkedItemRetentionCutoff(now)),
        ),
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
  now: Date,
) {
  return buildShoppingItemRouteRowsQuery(db, storeId)
    .where(
      and(
        eq(shoppingItems.shoppingListId, shoppingListId),
        eq(shoppingItems.isChecked, true),
        // Items checked within the retention window still live on the active
        // list; they only move here once the window lapses.
        lte(shoppingItems.checkedAt, checkedItemRetentionCutoff(now)),
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
      quantityText: input.quantityText,
      productConceptId: input.productConceptId,
      categorizationSource: input.categorizationSource,
      suggestedProductConceptName: input.suggestedProductConceptName,
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
      quantityText: input.quantityText,
      productConceptId: input.productConceptId,
      categorizationSource: input.categorizationSource,
      suggestedProductConceptName: null,
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

export function buildShoppingItemQuantityUpdateQuery(
  db: Database,
  input: ShoppingItemQuantityUpdateInput,
) {
  const now = input.now ?? new Date();

  return db
    .update(shoppingItems)
    .set({
      quantityText: input.quantityText,
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
      categorizationSource: "manual",
      suggestedProductConceptName: null,
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

export function buildAutomaticProductAliasInsertQuery(
  db: Database,
  input: AutomaticProductAliasInput,
) {
  const now = input.now ?? new Date();

  return db
    .insert(productAliases)
    .values({
      userId: input.userId,
      productConceptId: input.productConceptId,
      normalizedText: input.normalizedText,
      scope: "user",
      confidence: 1,
      source: "learned",
      isCorrection: false,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [productAliases.userId, productAliases.normalizedText],
      where: sql`${productAliases.scope} = 'user'`,
    })
    .returning();
}

// Only unchecked items count as duplicates: a checked-off item is history and
// must not block re-adding the same product on a later trip.
export function buildShoppingItemsByNormalizedTextQuery(
  db: Database,
  input: ShoppingItemNormalizedTextLookupInput,
) {
  return db
    .select({
      id: shoppingItems.id,
      rawText: shoppingItems.rawText,
      normalizedText: shoppingItems.normalizedText,
      quantityText: shoppingItems.quantityText,
      sourceIdentifier: shoppingItems.sourceIdentifier,
    })
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.shoppingListId, input.shoppingListId),
        eq(shoppingItems.isChecked, false),
        inArray(shoppingItems.normalizedText, input.normalizedTexts),
      ),
    );
}

// Which aliases are visible to a viewer: global aliases always, plus the
// viewer's own learned vocabulary.
export function productAliasUserScopeFilter(userId: string): SQL {
  return or(
    eq(productAliases.scope, "global"),
    and(eq(productAliases.scope, "user"), eq(productAliases.userId, userId)),
  ) as SQL;
}

export function buildExactProductAliasLookupQuery(
  db: Database,
  userId: string,
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
        productAliasUserScopeFilter(userId),
      ),
    )
    .orderBy(
      desc(productAliases.isCorrection),
      desc(
        sql<number>`case when ${productAliases.scope} = 'user' then 1 else 0 end`,
      ),
      desc(productAliases.confidence),
    )
    .limit(1);
}

export function buildExactProductAliasesLookupQuery(
  db: Database,
  userId: string,
  normalizedTexts: string[],
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
        inArray(productAliases.normalizedText, normalizedTexts),
        or(
          eq(productAliases.source, "learned"),
          eq(productAliases.source, "imported"),
        ),
        productAliasUserScopeFilter(userId),
      ),
    )
    .orderBy(
      desc(productAliases.isCorrection),
      desc(
        sql<number>`case when ${productAliases.scope} = 'user' then 1 else 0 end`,
      ),
      desc(productAliases.confidence),
    );
}

export async function findExactProductAlias(
  db: Database,
  userId: string,
  normalizedText: string,
) {
  const [match] = await buildExactProductAliasLookupQuery(
    db,
    userId,
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
