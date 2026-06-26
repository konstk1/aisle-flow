import { asc, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "../create-client";
import { productAliases, productConcepts, productLocations } from "../schema";

export interface ProductConceptCreateInput {
  canonicalName: string;
  normalizedName: string;
}

export interface ManualProductAliasCorrectionInput {
  storeId: string;
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

export function buildProductConceptListQuery(db: Database) {
  return db
    .select()
    .from(productConcepts)
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

export function productLocationIdByStoreAndConcept({
  productConceptId,
  storeId,
}: {
  productConceptId: string | SQL;
  storeId: string;
}): SQL<string> {
  return sql`(select ${productLocations.id} from ${productLocations} where ${productLocations.storeId} = ${storeId} and ${productLocations.productConceptId} = ${productConceptId} limit 1)`;
}

export function buildManualProductAliasCorrectionQuery(
  db: Database,
  input: ManualProductAliasCorrectionInput,
) {
  const now = input.now ?? new Date();

  return db
    .insert(productAliases)
    .values({
      storeId: input.storeId,
      productConceptId: input.productConceptId,
      normalizedText: input.normalizedText,
      scope: "store",
      confidence: input.confidence ?? 1,
      source: "learned",
      isCorrection: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [productAliases.storeId, productAliases.normalizedText],
      targetWhere: sql`${productAliases.scope} = 'store'`,
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
