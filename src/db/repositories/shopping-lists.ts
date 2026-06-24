import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import type { createDatabase } from "../create-client";
import {
  aisleSections,
  productAliases,
  productConcepts,
  productLocations,
  shoppingItems,
  shoppingLists,
} from "../schema";

export type Database = ReturnType<typeof createDatabase>;

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

export async function getActiveShoppingListInRouteOrder(
  db: Database,
  storeId: string,
) {
  const [list] = await buildActiveShoppingListQuery(db, storeId);

  if (!list) {
    return null;
  }

  const items = await buildRouteOrderedShoppingItemsQuery(db, storeId, list.id);

  return { list, items };
}

export function buildProductAliasLookupQuery(
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

export async function findProductAlias(
  db: Database,
  storeId: string,
  normalizedText: string,
) {
  const [match] = await buildProductAliasLookupQuery(
    db,
    storeId,
    normalizedText,
  );

  return match ?? null;
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
          eq(productAliases.isCorrection, true),
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
