import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import {
  normalizeProductText,
  prepareProductMatchingCatalog,
  resolveProductMatch,
  type ProductMatchResult,
  type PreparedProductMatchingCatalog,
} from "@/domain/product-matching";

import { getDb } from "@/db/client";
import type { Database } from "@/db/create-client";
import { ensureUserProductCatalog } from "@/db/product-catalog-seed";
import {
  findExactProductAlias,
  findProductLocation,
} from "@/db/repositories/shopping-lists";
import { productAliases, productConcepts } from "@/db/schema";

import { resolveCuratedQualifierRules } from "./product-catalog";

export interface ResolvedProductLocation {
  id: string;
  aisleSectionId: string;
  confidence: number;
  source: "curated" | "manual" | "inferred" | "imported";
}

export type StoreProductMatchResult =
  | (Extract<ProductMatchResult, { state: "matched" }> & {
      location: ResolvedProductLocation | null;
    })
  | Extract<ProductMatchResult, { state: "needs-user-correction" }>;

export type StoreProductMatcher = (
  text: string,
) => Promise<StoreProductMatchResult>;

// Learned aliases are the user's vocabulary; the store only determines which
// locations resolved matches route to.
export async function createStoreProductMatcher({
  db = getDb(),
  userId,
  storeId,
}: {
  db?: Database;
  userId: string;
  storeId: string | null;
}): Promise<StoreProductMatcher> {
  await ensureUserProductCatalog(db, userId);
  const catalog = await loadProductMatchingCatalog(db, userId);

  return async (text) => {
    const learnedAlias = await findExactProductAlias(
      db,
      userId,
      normalizeProductText(text),
    );

    return resolveProductMatchWithCatalog({
      catalog,
      db,
      learnedAlias,
      storeId,
      text,
      userId,
    });
  };
}

async function resolveProductMatchWithCatalog({
  catalog,
  db,
  learnedAlias,
  storeId,
  text,
  userId,
}: {
  catalog: PreparedProductMatchingCatalog;
  db: Database;
  learnedAlias: Awaited<ReturnType<typeof findExactProductAlias>>;
  storeId: string | null;
  text: string;
  userId: string;
}): Promise<StoreProductMatchResult> {
  const result = resolveProductMatch({
    text,
    catalog,
    learnedAlias: learnedAlias
      ? {
          normalizedText: learnedAlias.alias.normalizedText,
          productConcept: learnedAlias.productConcept,
          confidence: learnedAlias.alias.confidence,
        }
      : null,
  });

  if (result.state === "needs-user-correction") {
    return result;
  }

  const match = storeId
    ? await findProductLocation(db, userId, storeId, result.productConcept.id)
    : null;

  return {
    ...result,
    location: match
      ? {
          id: match.location.id,
          aisleSectionId: match.location.aisleSectionId,
          confidence: match.location.confidence,
          source: match.location.source,
        }
      : null,
  };
}

async function loadProductMatchingCatalog(
  db: Database,
  userId: string,
): Promise<PreparedProductMatchingCatalog> {
  const [concepts, aliases] = await Promise.all([
    db
      .select()
      .from(productConcepts)
      .where(
        and(
          eq(productConcepts.userId, userId),
          isNull(productConcepts.deletedAt),
        ),
      ),
    db
      .select()
      .from(productAliases)
      .where(
        and(
          eq(productAliases.userId, userId),
          eq(productAliases.source, "curated"),
          isNull(productAliases.deletedAt),
        ),
      ),
  ]);

  return prepareProductMatchingCatalog({
    concepts,
    curatedTerms: aliases.map((alias) => ({
      productConceptId: alias.productConceptId,
      text: alias.displayText,
    })),
    qualifierRules: resolveCuratedQualifierRules(concepts, aliases),
  });
}
