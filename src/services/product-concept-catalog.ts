import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db/create-client";
import { ensureUserProductCatalog } from "@/db/product-catalog-seed";
import { productConcepts } from "@/db/schema";
import type { ProductCategorizationConcept } from "@/domain/product-categorization";

export async function loadProductConceptCatalog(
  db: Database,
  userId: string,
): Promise<ProductCategorizationConcept[]> {
  await ensureUserProductCatalog(db, userId);

  return db
    .select({
      id: productConcepts.id,
      canonicalName: productConcepts.canonicalName,
      normalizedName: productConcepts.normalizedName,
      excludedTerms: productConcepts.excludedTerms,
    })
    .from(productConcepts)
    .where(
      and(
        eq(productConcepts.userId, userId),
        isNull(productConcepts.deletedAt),
      ),
    );
}
