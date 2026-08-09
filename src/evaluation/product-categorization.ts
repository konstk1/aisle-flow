import { NoObjectGeneratedError } from "ai";

import {
  ProductCategorizationError,
  type ProductCategorizationBatchResult,
  type ProductCategorizationConcept,
  type ProductCategorizationUsage,
} from "@/domain/product-categorization";
import { PRODUCTION_PRODUCT_CATEGORIZATION_MODEL } from "@/services/product-categorization-model";

export type EvaluationProvider = "openai" | "openrouter";

export interface EvaluationModel {
  provider: EvaluationProvider;
  modelId: string;
  displayName: string;
}

export const EVALUATION_MODELS = [
  {
    provider: "openai",
    modelId: "gpt-5-nano-2025-08-07",
    displayName: "gpt-5-nano-2025-08-07",
  },
  {
    provider: "openrouter",
    modelId: PRODUCTION_PRODUCT_CATEGORIZATION_MODEL,
    displayName: PRODUCTION_PRODUCT_CATEGORIZATION_MODEL,
  },
  {
    provider: "openai",
    modelId: "gpt-5.4-nano-2026-03-17",
    displayName: "gpt-5.4-nano-2026-03-17",
  },
  {
    provider: "openai",
    modelId: "gpt-4o-mini-2024-07-18",
    displayName: "gpt-4o-mini-2024-07-18",
  },
] as const satisfies readonly EvaluationModel[];

export const EVALUATION_ITEMS = [
  "Apples 2",
  "2 lbs chicken thighs",
  "rice vinegar",
  "vanilla oat milk",
  "paper towels 6 pack",
  "fresh basil",
  "sparkling water 12 cans",
] as const;

interface ModelPricing {
  input: number;
  cachedInput: number;
  output: number;
}

// USD per one million tokens. OpenAI does not return pricing in API responses.
// Verified 2026-07-16 against the official model pages:
// https://developers.openai.com/api/docs/models/gpt-5.4-nano
// https://developers.openai.com/api/docs/models/gpt-5-nano
// https://developers.openai.com/api/docs/models/gpt-4o-mini
export const EVALUATION_MODEL_PRICING_USD_PER_MILLION: Readonly<
  Record<string, ModelPricing>
> = {
  "gpt-5.4-nano-2026-03-17": {
    input: 0.2,
    cachedInput: 0.02,
    output: 1.25,
  },
  "gpt-5-nano-2025-08-07": {
    input: 0.05,
    cachedInput: 0.005,
    output: 0.4,
  },
  "gpt-4o-mini-2024-07-18": {
    input: 0.15,
    cachedInput: 0.075,
    output: 0.6,
  },
};

export function calculateEvaluationCost(
  modelId: string,
  usage: ProductCategorizationUsage,
): number | null {
  if (usage.costUsd !== undefined && usage.costUsd !== null) {
    return usage.costUsd;
  }

  const pricing = EVALUATION_MODEL_PRICING_USD_PER_MILLION[modelId];

  if (!pricing || usage.inputTokens === null || usage.outputTokens === null) {
    return null;
  }

  const cachedInputTokens = Math.min(
    Math.max(usage.cachedInputTokens ?? 0, 0),
    usage.inputTokens,
  );
  const uncachedInputTokens = usage.inputTokens - cachedInputTokens;

  return (
    (uncachedInputTokens * pricing.input +
      cachedInputTokens * pricing.cachedInput +
      usage.outputTokens * pricing.output) /
    1_000_000
  );
}

function formatEvaluationCost(cost: number | null): string {
  if (cost === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(cost);
}

export interface EvaluationResultRow {
  Provider: "OpenAI" | "OpenRouter";
  Model: string;
  "Submitted text": string;
  "Returned item name": string;
  Quantity: string;
  Concept: string;
  Error: string;
}

export interface EvaluationSummaryRow {
  Provider: "OpenAI" | "OpenRouter";
  Model: string;
  Status: "ok" | "failed";
  Duration: string;
  "Input tokens": number | string;
  "Output tokens": number | string;
  "Total tokens": number | string;
  "Total cost": string;
  "Returned items": number;
}

export async function runProductCategorizationEvaluation({
  categorize,
  concepts,
  items = EVALUATION_ITEMS,
  models = EVALUATION_MODELS,
}: {
  categorize: (input: {
    model: EvaluationModel;
    items: readonly string[];
    concepts: readonly ProductCategorizationConcept[];
  }) => Promise<ProductCategorizationBatchResult>;
  concepts: readonly ProductCategorizationConcept[];
  items?: readonly string[];
  models?: readonly EvaluationModel[];
}) {
  const resultRows: EvaluationResultRow[] = [];
  const summaryRows: EvaluationSummaryRow[] = [];
  const conceptsById = new Map(
    concepts.map((concept) => [concept.id, concept.canonicalName]),
  );

  console.info(
    `Product concept catalog (${concepts.length}): ${concepts
      .map((concept) => concept.canonicalName)
      .join(", ")}`,
  );

  for (const model of models) {
    const startedAt = Date.now();
    const provider = model.provider === "openai" ? "OpenAI" : "OpenRouter";

    try {
      const batch = await categorize({ model, items, concepts });
      const resultsByKey = new Map(
        batch.results.map((result) => [result.key, result]),
      );

      const modelResultRows = items.map((submittedText, index) => {
        const result = resultsByKey.get(String(index));

        if (!result) {
          throw new Error(`Missing result for evaluation item ${index}.`);
        }

        return {
          Provider: provider,
          Model: model.displayName,
          "Submitted text": submittedText,
          "Returned item name": result.itemName,
          Quantity: result.quantityText ?? "—",
          Concept:
            result.resolution.kind === "existing"
              ? (conceptsById.get(result.resolution.productConceptId) ??
                "Unknown concept")
              : `Suggested: ${result.resolution.canonicalName}`,
          Error: "",
        } satisfies EvaluationResultRow;
      });
      resultRows.push(...modelResultRows);

      summaryRows.push({
        Provider: provider,
        Model: model.displayName,
        Status: "ok",
        Duration: `${Date.now() - startedAt} ms`,
        "Input tokens": batch.usage.inputTokens ?? "—",
        "Output tokens": batch.usage.outputTokens ?? "—",
        "Total tokens": batch.usage.totalTokens ?? "—",
        "Total cost": formatEvaluationCost(
          calculateEvaluationCost(model.modelId, batch.usage),
        ),
        "Returned items": batch.results.length,
      });
    } catch (error) {
      const errorClass =
        error instanceof Error ? error.constructor.name : typeof error;
      if (NoObjectGeneratedError.isInstance(error)) {
        console.error("Model returned invalid structured output.", {
          cause:
            error.cause instanceof Error
              ? error.cause.message
              : typeof error.cause,
          errorClass,
          finishReason: error.finishReason,
          modelId: model.modelId,
          outputText: error.text,
          provider: model.provider,
        });
      }
      const errorDescription =
        error instanceof ProductCategorizationError
          ? error.message
          : errorClass;

      for (const submittedText of items) {
        resultRows.push({
          Provider: provider,
          Model: model.displayName,
          "Submitted text": submittedText,
          "Returned item name": "—",
          Quantity: "—",
          Concept: "—",
          Error: errorDescription,
        });
      }

      summaryRows.push({
        Provider: provider,
        Model: model.displayName,
        Status: "failed",
        Duration: `${Date.now() - startedAt} ms`,
        "Input tokens": "—",
        "Output tokens": "—",
        "Total tokens": "—",
        "Total cost": "—",
        "Returned items": 0,
      });
    }
  }

  const modelOrder = new Map(
    models.map((model, index) => [
      `${model.provider}:${model.displayName}`,
      index,
    ]),
  );
  resultRows.sort(
    (left, right) =>
      left["Submitted text"].localeCompare(right["Submitted text"], "en-US", {
        sensitivity: "base",
      }) ||
      (modelOrder.get(`${left.Provider.toLowerCase()}:${left.Model}`) ??
        Number.MAX_SAFE_INTEGER) -
        (modelOrder.get(`${right.Provider.toLowerCase()}:${right.Model}`) ??
          Number.MAX_SAFE_INTEGER),
  );

  console.table(resultRows);
  console.table(summaryRows);

  return {
    failed: summaryRows.some((row) => row.Status === "failed"),
    resultRows,
    summaryRows,
  };
}
