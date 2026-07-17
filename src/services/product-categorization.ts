import "server-only";

import { normalizeProductText } from "@/domain/product-matching";
import type {
  ProductCategorizationBatchResult,
  ProductCategorizationRequest,
  ProductCategorizationSource,
} from "@/domain/product-categorization";

import type { Database } from "@/db/create-client";
import { buildExactProductAliasesLookupQuery } from "@/db/repositories/shopping-lists";

import { categorizeProductsWithProductionModel } from "./openai-product-categorizer";
import { loadProductConceptCatalog } from "./product-concept-catalog";
import { createStoreProductMatcher } from "./product-matching";

export type ProductCategorizationMode = "ai" | "deterministic";

export interface SubmittedProductItem {
  key: string;
  submittedText: string;
}

export interface CategorizedSubmittedProduct {
  key: string;
  itemName: string;
  quantityText: string | null;
  productConceptId: string | null;
  confidence: number | null;
  source: ProductCategorizationSource;
  suggestedProductConceptName: string | null;
}

export class ProductCategorizationUnavailableError extends Error {
  readonly code = "AI_CATEGORIZATION_UNAVAILABLE";
  readonly retryable = true;
  readonly status = 503;

  constructor(options?: ErrorOptions) {
    super("The items could not be categorized.", options);
    this.name = "ProductCategorizationUnavailableError";
  }
}

export async function categorizeSubmittedProducts({
  categorizeWithAi = categorizeProductsWithProductionModel,
  db,
  items,
  mode,
  storeId,
  userId,
}: {
  categorizeWithAi?: (
    request: ProductCategorizationRequest,
  ) => Promise<ProductCategorizationBatchResult>;
  db: Database;
  items: readonly SubmittedProductItem[];
  mode: ProductCategorizationMode;
  storeId: string | null;
  userId: string;
}): Promise<CategorizedSubmittedProduct[]> {
  if (mode === "deterministic") {
    const resolveProductMatch = await createStoreProductMatcher({
      db,
      userId,
      storeId,
    });

    return Promise.all(
      items.map(async (item) => {
        const match = await resolveProductMatch(item.submittedText);
        const matched = match.state === "matched";

        return {
          key: item.key,
          itemName: item.submittedText,
          quantityText: null,
          productConceptId: matched ? match.productConcept.id : null,
          confidence: match.confidence,
          source:
            matched && match.source === "learned-alias"
              ? "learned-alias"
              : "deterministic",
          suggestedProductConceptName: null,
        };
      }),
    );
  }

  const normalizedTexts = [
    ...new Set(items.map((item) => normalizeProductText(item.submittedText))),
  ];
  const [concepts, aliasRows] = await Promise.all([
    loadProductConceptCatalog(db),
    normalizedTexts.length > 0
      ? buildExactProductAliasesLookupQuery(db, userId, normalizedTexts)
      : Promise.resolve([]),
  ]);
  const aliasesByNormalizedText = new Map<string, (typeof aliasRows)[number]>();

  for (const row of aliasRows) {
    if (!aliasesByNormalizedText.has(row.alias.normalizedText)) {
      aliasesByNormalizedText.set(row.alias.normalizedText, row);
    }
  }

  const unresolvedItems = items.filter(
    (item) =>
      !aliasesByNormalizedText.has(normalizeProductText(item.submittedText)),
  );
  let aiResults = new Map<
    string,
    ProductCategorizationBatchResult["results"][number]
  >();

  if (unresolvedItems.length > 0) {
    try {
      const batch = await categorizeWithAi({
        items: unresolvedItems,
        concepts,
      });
      aiResults = new Map(batch.results.map((result) => [result.key, result]));
    } catch (error) {
      console.error("Product categorization failed.", {
        errorClass:
          error instanceof Error ? error.constructor.name : typeof error,
        itemCount: unresolvedItems.length,
      });
      throw new ProductCategorizationUnavailableError({ cause: error });
    }
  }

  return items.map((item) => {
    const alias = aliasesByNormalizedText.get(
      normalizeProductText(item.submittedText),
    );

    if (alias) {
      return {
        key: item.key,
        itemName: item.submittedText,
        quantityText: null,
        productConceptId: alias.productConcept.id,
        confidence: alias.alias.confidence,
        source: "learned-alias" as const,
        suggestedProductConceptName: null,
      };
    }

    const result = aiResults.get(item.key);

    if (!result) {
      throw new ProductCategorizationUnavailableError({
        cause: new Error(`Missing reconciled result for ${item.key}.`),
      });
    }

    return {
      key: item.key,
      itemName: result.itemName,
      quantityText: result.quantityText,
      productConceptId:
        result.resolution.kind === "existing"
          ? result.resolution.productConceptId
          : null,
      confidence: result.confidence,
      source: "llm" as const,
      suggestedProductConceptName:
        result.resolution.kind === "suggested"
          ? result.resolution.canonicalName
          : null,
    };
  });
}
