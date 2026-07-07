import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "../create-client";
import {
  aisles,
  aisleSections,
  productAliases,
  productConcepts,
  productLocations,
} from "../schema";
import { productLocationStoreFilter } from "./shopping-lists";

export interface ProductConceptCreateInput {
  canonicalName: string;
  normalizedName: string;
}

export interface ManualProductAliasCorrectionInput {
  userId: string;
  productConceptId: string | SQL;
  normalizedText: string;
  confidence?: number;
  now?: Date;
}

export interface ManualProductLocationCorrectionInput {
  storeId: string;
  productConceptId: string | SQL;
  aisleSectionId: string;
  positionWithinSection: number | null;
  confidence?: number;
  now?: Date;
}

export function buildProductConceptListQuery(
  db: Database,
  storeId: string | null,
) {
  return db
    .select({
      productConcept: productConcepts,
      aisleSectionId: productLocations.aisleSectionId,
    })
    .from(productConcepts)
    .leftJoin(
      productLocations,
      and(
        eq(productLocations.productConceptId, productConcepts.id),
        productLocationStoreFilter(storeId),
      ),
    )
    .orderBy(asc(productConcepts.normalizedName));
}

export function buildProductConceptByIdQuery(
  db: Database,
  productConceptId: string,
) {
  return db
    .select()
    .from(productConcepts)
    .where(eq(productConcepts.id, productConceptId))
    .limit(1);
}

export function buildProductConceptCreateQuery(
  db: Database,
  input: ProductConceptCreateInput,
) {
  return db
    .insert(productConcepts)
    .values({
      canonicalName: input.canonicalName,
      normalizedName: input.normalizedName,
      excludedTerms: [],
    })
    .onConflictDoUpdate({
      target: productConcepts.normalizedName,
      set: {
        canonicalName: sql`${productConcepts.canonicalName}`,
      },
    })
    .returning();
}

export function productConceptIdByNormalizedName(
  normalizedName: string,
): SQL<string> {
  return sql`(select ${productConcepts.id} from ${productConcepts} where ${productConcepts.normalizedName} = ${normalizedName} limit 1)`;
}

export function buildManualProductAliasCorrectionQuery(
  db: Database,
  input: ManualProductAliasCorrectionInput,
) {
  const now = input.now ?? new Date();

  return db
    .insert(productAliases)
    .values({
      userId: input.userId,
      productConceptId: input.productConceptId,
      normalizedText: input.normalizedText,
      scope: "user",
      confidence: input.confidence ?? 1,
      source: "learned",
      isCorrection: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [productAliases.userId, productAliases.normalizedText],
      targetWhere: sql`${productAliases.scope} = 'user'`,
      // Re-correcting an exact phrase is intentionally last-writer-wins for the
      // MVP; product_aliases has no version column yet.
      set: {
        productConceptId: sql.raw("excluded.product_concept_id"),
        confidence: sql.raw("excluded.confidence"),
        source: sql.raw("excluded.source"),
        isCorrection: sql.raw("excluded.is_correction"),
        updatedAt: now,
      },
    })
    .returning();
}

// Aliases are the user's vocabulary across stores; the location column is
// resolved against the given store, so it can be absent per row (or entirely
// when the user has no store).
export function buildLearnedAliasListQuery(
  db: Database,
  userId: string,
  storeId: string | null,
) {
  return db
    .select({
      alias: productAliases,
      productConcept: productConcepts,
      location: productLocations,
      aisleSection: aisleSections,
      aisle: aisles,
    })
    .from(productAliases)
    .innerJoin(
      productConcepts,
      eq(productAliases.productConceptId, productConcepts.id),
    )
    .leftJoin(
      productLocations,
      and(
        productLocationStoreFilter(storeId),
        eq(productLocations.productConceptId, productConcepts.id),
      ),
    )
    .leftJoin(
      aisleSections,
      eq(productLocations.aisleSectionId, aisleSections.id),
    )
    .leftJoin(aisles, eq(aisleSections.aisleId, aisles.id))
    .where(
      and(
        eq(productAliases.userId, userId),
        eq(productAliases.source, "learned"),
        eq(productAliases.isCorrection, true),
      ),
    )
    .orderBy(
      desc(productAliases.updatedAt),
      asc(productAliases.normalizedText),
    );
}

// Scoped to the owning user so callers cannot read another user's alias by id.
export function buildLearnedAliasByIdQuery(
  db: Database,
  userId: string,
  aliasId: string,
) {
  return db
    .select()
    .from(productAliases)
    .where(
      and(
        eq(productAliases.id, aliasId),
        eq(productAliases.userId, userId),
        eq(productAliases.source, "learned"),
        eq(productAliases.isCorrection, true),
      ),
    )
    .limit(1);
}

// Scoped to the owning user so ownership is enforced in the query, not just by
// the caller fetching via buildLearnedAliasByIdQuery first.
export function buildLearnedAliasDeleteQuery(
  db: Database,
  userId: string,
  aliasId: string,
) {
  return db
    .delete(productAliases)
    .where(
      and(
        eq(productAliases.id, aliasId),
        eq(productAliases.userId, userId),
        eq(productAliases.source, "learned"),
        eq(productAliases.isCorrection, true),
      ),
    )
    .returning();
}

export function buildManualProductLocationCorrectionQuery(
  db: Database,
  input: ManualProductLocationCorrectionInput,
) {
  const now = input.now ?? new Date();

  return db
    .insert(productLocations)
    .values({
      storeId: input.storeId,
      productConceptId: input.productConceptId,
      aisleSectionId: input.aisleSectionId,
      positionWithinSection: input.positionWithinSection,
      confidence: input.confidence ?? 1,
      source: "manual",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [productLocations.storeId, productLocations.productConceptId],
      set: {
        aisleSectionId: sql.raw("excluded.aisle_section_id"),
        confidence: sql.raw("excluded.confidence"),
        source: sql.raw("excluded.source"),
        updatedAt: now,
        version: sql`${productLocations.version} + 1`,
      },
    })
    .returning();
}
