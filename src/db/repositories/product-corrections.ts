import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";

import type { Database } from "../create-client";
import { productAliases, productConcepts, productLocations } from "../schema";
import { productLocationStoreFilter } from "./shopping-lists";

export interface ProductConceptCreateInput {
  userId: string;
  canonicalName: string;
  normalizedName: string;
}

export interface ManualProductAliasCorrectionInput {
  userId: string;
  productConceptId: string | SQL;
  displayText: string;
  normalizedText: string;
  confidence?: number;
  now?: Date;
}

export interface ManualProductLocationCorrectionInput {
  userId: string;
  storeId: string;
  productConceptId: string | SQL;
  aisleSectionId: string;
  confidence?: number;
  now?: Date;
}

export function buildProductConceptListQuery(
  db: Database,
  userId: string,
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
        eq(productLocations.userId, userId),
        productLocationStoreFilter(storeId),
      ),
    )
    .where(
      and(
        eq(productConcepts.userId, userId),
        isNull(productConcepts.deletedAt),
      ),
    )
    .orderBy(asc(productConcepts.normalizedName));
}

export function buildProductConceptByIdQuery(
  db: Database,
  userId: string,
  productConceptId: string,
) {
  return db
    .select()
    .from(productConcepts)
    .where(
      and(
        eq(productConcepts.id, productConceptId),
        eq(productConcepts.userId, userId),
        isNull(productConcepts.deletedAt),
      ),
    )
    .limit(1);
}

export function buildProductConceptCreateQuery(
  db: Database,
  input: ProductConceptCreateInput,
) {
  return db
    .insert(productConcepts)
    .values({
      userId: input.userId,
      canonicalName: input.canonicalName,
      normalizedName: input.normalizedName,
      excludedTerms: [],
    })
    .onConflictDoUpdate({
      target: [productConcepts.userId, productConcepts.normalizedName],
      targetWhere: isNull(productConcepts.deletedAt),
      set: {
        canonicalName: sql`${productConcepts.canonicalName}`,
      },
    })
    .returning();
}

export function productConceptIdByNormalizedName(
  userId: string,
  normalizedName: string,
): SQL<string> {
  return sql`(select ${productConcepts.id} from ${productConcepts} where ${and(
    eq(productConcepts.userId, userId),
    eq(productConcepts.normalizedName, normalizedName),
    isNull(productConcepts.deletedAt),
  )} limit 1)`;
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
      displayText: input.displayText,
      normalizedText: input.normalizedText,
      scope: "user",
      confidence: input.confidence ?? 1,
      source: "learned",
      isCorrection: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [productAliases.userId, productAliases.normalizedText],
      targetWhere: isNull(productAliases.deletedAt),
      // Re-correcting an exact phrase is intentionally last-writer-wins for the
      // MVP; product_aliases has no version column yet.
      set: {
        productConceptId: sql.raw("excluded.product_concept_id"),
        displayText: sql.raw("excluded.display_text"),
        confidence: sql.raw("excluded.confidence"),
        source: sql.raw("excluded.source"),
        isCorrection: sql.raw("excluded.is_correction"),
        updatedAt: now,
      },
    })
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
      userId: input.userId,
      storeId: input.storeId,
      productConceptId: input.productConceptId,
      aisleSectionId: input.aisleSectionId,
      confidence: input.confidence ?? 1,
      source: "manual",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        productLocations.userId,
        productLocations.storeId,
        productLocations.productConceptId,
      ],
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
