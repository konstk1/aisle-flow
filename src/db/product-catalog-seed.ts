import { sql } from "drizzle-orm";

import { normalizeProductText } from "@/domain/product-matching";
import { curatedProductConcepts } from "@/services/product-catalog";

import type { Database } from "./create-client";
import { productConcepts } from "./schema";

export async function seedCuratedProductCatalog(db: Database) {
  await buildCuratedProductConceptSeedQuery(db);
}

export function buildCuratedProductConceptSeedQuery(db: Database) {
  return db
    .insert(productConcepts)
    .values(
      curatedProductConcepts.map((concept) => ({
        canonicalName: concept.canonicalName,
        normalizedName: normalizeProductText(concept.canonicalName),
        excludedTerms: concept.excludedTerms.map(normalizeProductText),
      })),
    )
    .onConflictDoUpdate({
      target: productConcepts.normalizedName,
      set: {
        canonicalName: sql.raw("excluded.canonical_name"),
        excludedTerms: sql.raw("excluded.excluded_terms"),
        updatedAt: new Date(),
      },
    });
}
