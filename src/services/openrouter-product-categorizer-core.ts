import {
  createOpenRouter,
  type OpenRouterUsageAccounting,
} from "@openrouter/ai-sdk-provider";
import type { ProviderMetadata } from "ai";

import type { ProductCategorizationRequest } from "@/domain/product-categorization";

import { categorizeProductsWithModel } from "./openai-product-categorizer-core";

function openRouterCostUsd(
  metadata: ProviderMetadata | undefined,
): number | null {
  const openRouterMetadata = metadata?.openrouter as
    | { usage?: OpenRouterUsageAccounting }
    | undefined;
  const cost = openRouterMetadata?.usage?.cost;

  return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
}

export function categorizeProductsWithOpenRouter({
  apiKey,
  modelId,
  request,
}: {
  apiKey: string;
  modelId: string;
  request: ProductCategorizationRequest;
}) {
  const provider = createOpenRouter({
    apiKey,
    appName: "Aisle Flow",
    compatibility: "strict",
  });

  return categorizeProductsWithModel({
    costUsdFromProviderMetadata: openRouterCostUsd,
    model: provider.chat(modelId, {
      plugins: [{ id: "response-healing" }],
      provider: { require_parameters: true },
      reasoning: { effort: "low" },
      // GPT-OSS Nitro may route through open-source backends such as Groq,
      // where strict JSON Schema can end after reasoning without final output.
      structuredOutputs: { strict: false },
      usage: { include: true },
    }),
    modelId,
    request,
  });
}
