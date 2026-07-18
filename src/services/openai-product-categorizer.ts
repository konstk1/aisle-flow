import "server-only";

import { getValidatedOpenAiEnv } from "@/env/schema";
import type { ProductCategorizationRequest } from "@/domain/product-categorization";

import {
  categorizeProductsWithOpenAI,
  PRODUCT_CATEGORIZATION_MODEL,
} from "./openai-product-categorizer-core";

export function categorizeProductsWithProductionModel(
  request: ProductCategorizationRequest,
) {
  const { OPENAI_API_KEY } = getValidatedOpenAiEnv(process.env);

  return categorizeProductsWithOpenAI({
    apiKey: OPENAI_API_KEY,
    modelId: PRODUCT_CATEGORIZATION_MODEL,
    request,
  });
}
