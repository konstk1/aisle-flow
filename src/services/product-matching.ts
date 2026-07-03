import "server-only";

import { and, eq } from "drizzle-orm";

import {
  normalizeProductText,
  prepareProductMatchingCatalog,
  resolveProductMatch,
  type ProductMatchResult,
  type PreparedProductMatchingCatalog,
} from "@/domain/product-matching";

import { getDb } from "@/db/client";
import type { Database } from "@/db/create-client";
import {
  findExactProductAlias,
  findProductLocation,
  productAliasStoreScopeFilter,
} from "@/db/repositories/shopping-lists";
import { productAliases, productConcepts } from "@/db/schema";

import { resolveCuratedQualifierRules } from "./product-catalog";

export interface ResolvedProductLocation {
  id: string;
  aisleSectionId: string;
  positionWithinSection: number | null;
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

export async function resolveProductMatchForStore({
  storeId,
  text,
}: {
  storeId: string | null;
  text: string;
}): Promise<StoreProductMatchResult> {
  const db = getDb();
  const [catalog, learnedAlias] = await Promise.all([
    loadProductMatchingCatalog(db, storeId),
    findExactProductAlias(db, storeId, normalizeProductText(text)),
  ]);

  return resolveProductMatchWithCatalog({
    catalog,
    db,
    learnedAlias,
    storeId,
    text,
  });
}

export async function createStoreProductMatcher({
  db = getDb(),
  storeId,
}: {
  db?: Database;
  storeId: string | null;
}): Promise<StoreProductMatcher> {
  const catalog = await loadProductMatchingCatalog(db, storeId);

  return async (text) => {
    const learnedAlias = await findExactProductAlias(
      db,
      storeId,
      normalizeProductText(text),
    );

    return resolveProductMatchWithCatalog({
      catalog,
      db,
      learnedAlias,
      storeId,
      text,
    });
  };
}

async function resolveProductMatchWithCatalog({
  catalog,
  db,
  learnedAlias,
  storeId,
  text,
}: {
  catalog: PreparedProductMatchingCatalog;
  db: Database;
  learnedAlias: Awaited<ReturnType<typeof findExactProductAlias>>;
  storeId: string | null;
  text: string;
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
    ? await findProductLocation(db, storeId, result.productConcept.id)
    : null;

  return {
    ...result,
    location: match
      ? {
          id: match.location.id,
          aisleSectionId: match.location.aisleSectionId,
          positionWithinSection: match.location.positionWithinSection,
          confidence: match.location.confidence,
          source: match.location.source,
        }
      : null,
  };
}

async function loadProductMatchingCatalog(
  db: Database,
  storeId: string | null,
): Promise<PreparedProductMatchingCatalog> {
  const [concepts, curatedAliases] = await Promise.all([
    db.select().from(productConcepts),
    db
      .select({ alias: productAliases })
      .from(productAliases)
      .where(
        and(
          // Learned and imported aliases are exact-only in the MVP. Imported
          // source vocabulary may be store- or provider-specific, and learned
          // corrections are persisted as exact aliases for manual precedence.
          eq(productAliases.source, "curated"),
          productAliasStoreScopeFilter(storeId),
        ),
      ),
  ]);

  return prepareProductMatchingCatalog({
    concepts,
    curatedTerms: curatedAliases.map(({ alias }) => ({
      productConceptId: alias.productConceptId,
      text: alias.normalizedText,
    })),
    qualifierRules: resolveCuratedQualifierRules(concepts),
  });
}
