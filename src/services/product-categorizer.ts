import "server-only";

import { NoObjectGeneratedError } from "ai";

import type { ProductCategorizationRequest } from "@/domain/product-categorization";
import { getValidatedOpenRouterEnv } from "@/env/schema";

import { categorizeProductsWithOpenRouter } from "./openrouter-product-categorizer-core";
import { PRODUCTION_PRODUCT_CATEGORIZATION_MODEL } from "./product-categorization-model";

export { PRODUCTION_PRODUCT_CATEGORIZATION_MODEL } from "./product-categorization-model";

function logExhaustedStructuredOutputRetry(error: NoObjectGeneratedError) {
  console.error(
    "Product categorization returned invalid structured output after retry.",
    {
      finishReason: error.finishReason,
      inputTokens: error.usage?.inputTokens,
      modelId: PRODUCTION_PRODUCT_CATEGORIZATION_MODEL,
      outputTokens: error.usage?.outputTokens,
      responseId: error.response?.id,
      responseModelId: error.response?.modelId,
      totalTokens: error.usage?.totalTokens,
    },
  );
}

export async function categorizeProductsWithProductionModel(
  request: ProductCategorizationRequest,
) {
  const { OPENROUTER_API_KEY } = getValidatedOpenRouterEnv(process.env);
  const categorize = () =>
    categorizeProductsWithOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      modelId: PRODUCTION_PRODUCT_CATEGORIZATION_MODEL,
      request,
    });

  try {
    return await categorize();
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) {
      throw error;
    }
  }

  try {
    return await categorize();
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      logExhaustedStructuredOutputRetry(error);
    }

    throw error;
  }
}
