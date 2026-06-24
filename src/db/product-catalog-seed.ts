import { normalizeProductText } from "@/domain/product-matching";
import { curatedProductConcepts } from "@/services/product-catalog";

import type { Database } from "./repositories/shopping-lists";
import { productAliases, productConcepts } from "./schema";

export async function seedCuratedProductCatalog(db: Database) {
  await db
    .insert(productConcepts)
    .values(
      curatedProductConcepts.map((concept) => ({
        canonicalName: concept.canonicalName,
        normalizedName: normalizeProductText(concept.canonicalName),
        excludedTerms: concept.excludedTerms.map(normalizeProductText),
      })),
    )
    .onConflictDoNothing();

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
      isCorrection: false,
    }));
  });

  if (aliases.length > 0) {
    await db.insert(productAliases).values(aliases).onConflictDoNothing();
  }
}
