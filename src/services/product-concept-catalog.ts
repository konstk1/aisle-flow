import type { Database } from "@/db/create-client";
import { productConcepts } from "@/db/schema";
import type { ProductCategorizationConcept } from "@/domain/product-categorization";

export async function loadProductConceptCatalog(
  db: Database,
): Promise<ProductCategorizationConcept[]> {
  return db
    .select({
      id: productConcepts.id,
      canonicalName: productConcepts.canonicalName,
      normalizedName: productConcepts.normalizedName,
      excludedTerms: productConcepts.excludedTerms,
    })
    .from(productConcepts);
}
