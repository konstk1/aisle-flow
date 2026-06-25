import { eq, sql } from "drizzle-orm";

import { normalizeProductText } from "@/domain/product-matching";
import { curatedProductConcepts } from "@/services/product-catalog";

import type { Database } from "./create-client";
import { productAliases, productConcepts } from "./schema";

interface CuratedProductAliasSeed {
  productConceptId: string;
  normalizedText: string;
  scope: "global";
  confidence: number;
  source: "curated";
  isCorrection: false;
}

export async function seedCuratedProductCatalog(db: Database) {
  await buildCuratedProductConceptSeedQuery(db);

  const concepts = await db.select().from(productConcepts);
  const conceptIdsByName = new Map(
    concepts.map((concept) => [concept.normalizedName, concept.id]),
  );
  const aliases = curatedProductConcepts.flatMap((concept) => {
    const productConceptId = conceptIdsByName.get(
      normalizeProductText(concept.canonicalName),
    );

    if (!productConceptId) {
      return [];
    }

    return concept.terms.map((term) => ({
      productConceptId,
      normalizedText: normalizeProductText(term),
      scope: "global" as const,
      confidence: 1,
      source: "curated" as const,
      isCorrection: false as const,
    }));
  });

  if (aliases.length > 0) {
    await buildCuratedProductAliasSeedQuery(db, aliases);
  }
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

export function buildCuratedProductAliasSeedQuery(
  db: Database,
  aliases: readonly CuratedProductAliasSeed[],
) {
  return db
    .insert(productAliases)
    .values([...aliases])
    .onConflictDoUpdate({
      target: productAliases.normalizedText,
      targetWhere: sql`${productAliases.scope} = 'global'`,
      setWhere: eq(productAliases.source, "curated"),
      set: {
        productConceptId: sql.raw("excluded.product_concept_id"),
        confidence: sql.raw("excluded.confidence"),
        source: sql.raw("excluded.source"),
        isCorrection: sql.raw("excluded.is_correction"),
        updatedAt: new Date(),
      },
    });
}
