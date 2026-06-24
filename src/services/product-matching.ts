import "server-only";

import { and, eq, or } from "drizzle-orm";

import {
  normalizeProductText,
  resolveProductMatch,
  type ProductMatchResult,
  type ProductMatchingCatalog,
} from "@/domain/product-matching";

import { getDb } from "@/db/client";
import {
  findExactProductAlias,
  findProductLocation,
  type Database,
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

export async function resolveProductMatchForStore({
  storeId,
  text,
}: {
  storeId: string;
  text: string;
}): Promise<StoreProductMatchResult> {
  const db = getDb();
  const normalizedText = normalizeProductText(text);
  const [catalog, learnedAlias] = await Promise.all([
    loadProductMatchingCatalog(db, storeId),
    findExactProductAlias(db, storeId, normalizedText),
  ]);
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

  const match = await findProductLocation(
    db,
    storeId,
    result.productConcept.id,
  );

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
  storeId: string,
): Promise<ProductMatchingCatalog> {
  const [concepts, curatedAliases] = await Promise.all([
    db.select().from(productConcepts),
    db
      .select({ alias: productAliases })
      .from(productAliases)
      .where(
        and(
          eq(productAliases.source, "curated"),
          or(
            eq(productAliases.scope, "global"),
            and(
              eq(productAliases.scope, "store"),
              eq(productAliases.storeId, storeId),
            ),
          ),
        ),
      ),
  ]);

  return {
    concepts,
    curatedTerms: curatedAliases.map(({ alias }) => ({
      productConceptId: alias.productConceptId,
      text: alias.normalizedText,
    })),
    qualifierRules: resolveCuratedQualifierRules(concepts),
  };
}
