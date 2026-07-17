import { z } from "zod";

import { normalizeProductText } from "./product-matching";
import {
  MAX_SHOPPING_ITEM_QUANTITY_LENGTH,
  MAX_SHOPPING_ITEM_TEXT_LENGTH,
  MAX_SUGGESTED_PRODUCT_CONCEPT_NAME_LENGTH,
} from "./shopping-item-constants";

export {
  MAX_SHOPPING_ITEM_QUANTITY_LENGTH,
  MAX_SUGGESTED_PRODUCT_CONCEPT_NAME_LENGTH,
} from "./shopping-item-constants";

export type ProductCategorizationSource =
  | "learned-alias"
  | "llm"
  | "deterministic"
  | "manual";

export type ProductCategorizationReviewState = "none" | "suggested-concept";

export interface ProductCategorizationItem {
  key: string;
  submittedText: string;
}

export interface ProductCategorizationConcept {
  id: string;
  canonicalName: string;
  normalizedName: string;
  excludedTerms: readonly string[];
}

export interface ProductCategorizationRequest {
  items: readonly ProductCategorizationItem[];
  concepts: readonly ProductCategorizationConcept[];
}

export type ProductCategorizationResolution =
  | { kind: "existing"; productConceptId: string }
  | { kind: "suggested"; canonicalName: string };

export interface ProductCategorizationResult {
  key: string;
  itemName: string;
  quantityText: string | null;
  resolution: ProductCategorizationResolution;
}

export interface ProductCategorizationUsage {
  inputTokens: number | null;
  cachedInputTokens?: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface ProductCategorizationBatchResult {
  results: ProductCategorizationResult[];
  usage: ProductCategorizationUsage;
}

function createOutputSchema(productConceptIdSchema: z.ZodType<string | null>) {
  return z.object({
    results: z.array(
      z.object({
        key: z.string().min(1),
        itemName: z.string().min(1).max(MAX_SHOPPING_ITEM_TEXT_LENGTH),
        quantityText: z
          .string()
          .max(MAX_SHOPPING_ITEM_QUANTITY_LENGTH)
          .nullable(),
        resolution: z.object({
          kind: z.enum(["existing", "suggested"]),
          productConceptId: productConceptIdSchema,
          canonicalName: z
            .string()
            .max(MAX_SUGGESTED_PRODUCT_CONCEPT_NAME_LENGTH)
            .nullable(),
        }),
      }),
    ),
  });
}

export const productCategorizationOutputSchema = createOutputSchema(
  z.string().nullable(),
);

export function createProductCategorizationProviderOutputSchema(
  concepts: readonly ProductCategorizationConcept[],
) {
  const canonicalNames = [
    ...new Set(concepts.map((concept) => concept.canonicalName)),
  ];
  const existingConceptNameSchema =
    canonicalNames.length === 0
      ? z.null()
      : z.enum(canonicalNames as [string, ...string[]]).nullable();

  return z.object({
    results: z.array(
      z.object({
        key: z.string().min(1),
        itemName: z.string().min(1).max(MAX_SHOPPING_ITEM_TEXT_LENGTH),
        quantityText: z
          .string()
          .max(MAX_SHOPPING_ITEM_QUANTITY_LENGTH)
          .nullable(),
        resolution: z.object({
          kind: z.enum(["existing", "suggested"]),
          existingConceptName: existingConceptNameSchema,
          suggestedConceptName: z
            .string()
            .max(MAX_SUGGESTED_PRODUCT_CONCEPT_NAME_LENGTH)
            .nullable(),
        }),
      }),
    ),
  });
}

export type ProductCategorizationModelResult = z.infer<
  typeof productCategorizationOutputSchema
>["results"][number];

export class ProductCategorizationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProductCategorizationError";
  }
}

export function reconcileProductCategorizationResults(
  request: ProductCategorizationRequest,
  rawResults: readonly ProductCategorizationModelResult[],
): ProductCategorizationResult[] {
  const requestedKeys = new Set(request.items.map((item) => item.key));

  if (requestedKeys.size !== request.items.length) {
    throw new ProductCategorizationError(
      "Categorization request contains duplicate item keys.",
    );
  }

  const parsed = productCategorizationOutputSchema.safeParse({
    results: rawResults,
  });

  if (!parsed.success) {
    throw new ProductCategorizationError(
      "Categorization returned an invalid structured result.",
    );
  }

  const conceptIds = new Set(request.concepts.map((concept) => concept.id));
  const conceptIdsByNormalizedName = new Map(
    request.concepts.map((concept) => [concept.normalizedName, concept.id]),
  );
  const resultsByKey = new Map<string, ProductCategorizationResult>();

  for (const rawResult of parsed.data.results) {
    if (!requestedKeys.has(rawResult.key)) {
      throw new ProductCategorizationError(
        `Categorization returned an unknown item key: ${rawResult.key}.`,
      );
    }

    if (resultsByKey.has(rawResult.key)) {
      throw new ProductCategorizationError(
        `Categorization returned item ${rawResult.key} more than once.`,
      );
    }

    const itemName = rawResult.itemName.trim();
    const quantityText = rawResult.quantityText?.trim() || null;

    if (!normalizeProductText(itemName)) {
      throw new ProductCategorizationError(
        `Categorization returned a blank item name for ${rawResult.key}.`,
      );
    }

    let resolution: ProductCategorizationResolution;

    if (rawResult.resolution.kind === "existing") {
      const productConceptId = rawResult.resolution.productConceptId?.trim();

      if (!productConceptId) {
        throw new ProductCategorizationError(
          `Categorization returned an invalid existing resolution for ${rawResult.key}.`,
        );
      }

      if (!conceptIds.has(productConceptId)) {
        throw new ProductCategorizationError(
          `Categorization returned an unknown product concept for ${rawResult.key}.`,
        );
      }

      resolution = { kind: "existing", productConceptId };
    } else {
      const canonicalName = rawResult.resolution.canonicalName?.trim();
      const normalizedCanonicalName = canonicalName
        ? normalizeProductText(canonicalName)
        : "";

      if (!canonicalName || !normalizedCanonicalName) {
        throw new ProductCategorizationError(
          `Categorization returned an invalid concept suggestion for ${rawResult.key}.`,
        );
      }

      const existingProductConceptId = conceptIdsByNormalizedName.get(
        normalizedCanonicalName,
      );
      resolution = existingProductConceptId
        ? { kind: "existing", productConceptId: existingProductConceptId }
        : { kind: "suggested", canonicalName };
    }

    resultsByKey.set(rawResult.key, {
      ...rawResult,
      itemName,
      quantityText,
      resolution,
    });
  }

  if (resultsByKey.size !== request.items.length) {
    throw new ProductCategorizationError(
      "Categorization did not return exactly one result for every submitted item.",
    );
  }

  return request.items.map((item) => {
    const result = resultsByKey.get(item.key);

    if (!result) {
      throw new ProductCategorizationError(
        `Categorization omitted item ${item.key}.`,
      );
    }

    return result;
  });
}

export function deriveProductCategorizationReviewState({
  suggestedConceptName,
}: {
  suggestedConceptName: string | null;
}): ProductCategorizationReviewState {
  if (suggestedConceptName) {
    return "suggested-concept";
  }

  return "none";
}

export function formatShoppingItemTitle(
  itemName: string,
  quantityText: string | null,
) {
  return quantityText ? `${itemName} (${quantityText})` : itemName;
}
