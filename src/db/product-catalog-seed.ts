import { and, eq, sql } from "drizzle-orm";

import { normalizeProductText } from "@/domain/product-matching";
import {
  curatedProductConcepts,
  PRODUCT_CATALOG_SEED_VERSION,
  productAliasSeedKey,
  productConceptSeedKey,
} from "@/services/product-catalog";

import type { Database } from "./create-client";
import { productAliases, productConcepts, user } from "./schema";

export async function seedCuratedProductCatalog(db: Database) {
  const users = await db.select({ id: user.id }).from(user);

  for (const catalogUser of users) {
    await ensureUserProductCatalog(db, catalogUser.id);
  }
}

export async function ensureUserProductCatalog(db: Database, userId: string) {
  const [catalogUser] = await db
    .select({ seedVersion: user.productCatalogSeedVersion })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!catalogUser || catalogUser.seedVersion >= PRODUCT_CATALOG_SEED_VERSION) {
    return;
  }

  await db.batch([
    buildCuratedProductConceptSeedQuery(db, userId),
    buildCuratedProductAliasSeedQuery(db, userId),
    db
      .update(user)
      .set({
        productCatalogSeedVersion: PRODUCT_CATALOG_SEED_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId)),
  ]);
}

export function buildCuratedProductConceptSeedQuery(
  db: Database,
  userId: string,
) {
  return db
    .insert(productConcepts)
    .values(
      curatedProductConcepts.map((concept) => ({
        userId,
        seedKey: productConceptSeedKey(concept.canonicalName),
        canonicalName: concept.canonicalName,
        normalizedName: normalizeProductText(concept.canonicalName),
        excludedTerms: concept.excludedTerms.map(normalizeProductText),
      })),
    )
    .onConflictDoNothing();
}

export function buildCuratedProductAliasSeedQuery(
  db: Database,
  userId: string,
) {
  const aliases = curatedProductConcepts.flatMap((concept) => {
    const conceptSeedKey = productConceptSeedKey(concept.canonicalName);

    return concept.terms.map((term) => ({
      userId,
      productConceptId: sql<string>`(
        select ${productConcepts.id}
        from ${productConcepts}
        where ${and(
          eq(productConcepts.userId, userId),
          eq(productConcepts.seedKey, conceptSeedKey),
        )}
        limit 1
      )`,
      seedKey: productAliasSeedKey(conceptSeedKey, term),
      displayText: term,
      normalizedText: normalizeProductText(term),
      scope: "user" as const,
      confidence: 1,
      source: "curated" as const,
      isCorrection: false,
    }));
  });

  return db.insert(productAliases).values(aliases).onConflictDoNothing();
}
