import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductCategorizationError } from "@/domain/product-categorization";
import { PRODUCTION_PRODUCT_CATEGORIZATION_MODEL } from "@/services/product-categorization-model";

import {
  calculateEvaluationCost,
  EVALUATION_MODELS,
  type EvaluationModel,
  runProductCategorizationEvaluation,
} from "./product-categorization";

const concepts = [
  {
    id: "apples",
    canonicalName: "Apples",
    normalizedName: "apples",
    excludedTerms: [],
  },
];

function evaluationModel(
  modelId: string,
  provider: EvaluationModel["provider"] = "openai",
): EvaluationModel {
  return { displayName: modelId, modelId, provider };
}

describe("product categorization evaluation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("evaluates the OpenAI baselines and GPT-OSS 120B Nitro through OpenRouter", () => {
    expect(EVALUATION_MODELS).toEqual([
      evaluationModel("gpt-5-nano-2025-08-07"),
      evaluationModel(PRODUCTION_PRODUCT_CATEGORIZATION_MODEL, "openrouter"),
      evaluationModel("gpt-5.4-nano-2026-03-17"),
      evaluationModel("gpt-4o-mini-2024-07-18"),
    ]);
  });

  it("runs models sequentially, groups rows by submitted text, and continues after failure", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
    let running = false;
    const categorize = vi.fn(async ({ model }) => {
      expect(running).toBe(false);
      running = true;
      await Promise.resolve();
      running = false;

      if (model.modelId === "broken") {
        throw new Error("provider body should not be printed");
      }

      return {
        results: ["Bananas", "Apples"].map((itemName, index) => ({
          key: String(index),
          itemName,
          quantityText: index === 1 ? "2" : null,
          resolution: {
            kind: "existing" as const,
            productConceptId: "apples",
          },
        })),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    });

    const evaluation = await runProductCategorizationEvaluation({
      categorize,
      concepts,
      items: ["Bananas", "Apples 2"],
      models: [
        evaluationModel("gpt-5.4-nano-2026-03-17"),
        evaluationModel("broken", "openrouter"),
        evaluationModel("gpt-4o-mini-2024-07-18"),
      ],
    });

    expect(
      categorize.mock.calls.map(([input]) => [
        input.model.provider,
        input.model.modelId,
      ]),
    ).toEqual([
      ["openai", "gpt-5.4-nano-2026-03-17"],
      ["openrouter", "broken"],
      ["openai", "gpt-4o-mini-2024-07-18"],
    ]);
    expect(evaluation.failed).toBe(true);
    expect(
      evaluation.resultRows.map((row) => [row["Submitted text"], row.Model]),
    ).toEqual([
      ["Apples 2", "gpt-5.4-nano-2026-03-17"],
      ["Apples 2", "broken"],
      ["Apples 2", "gpt-4o-mini-2024-07-18"],
      ["Bananas", "gpt-5.4-nano-2026-03-17"],
      ["Bananas", "broken"],
      ["Bananas", "gpt-4o-mini-2024-07-18"],
    ]);
    expect(evaluation.resultRows[0]).toMatchObject({
      Concept: "Apples",
      Quantity: "2",
    });
    expect(evaluation.resultRows[1]?.Error).toBe("Error");
    expect(evaluation.resultRows[1]?.Provider).toBe("OpenRouter");
    expect(evaluation.summaryRows).toHaveLength(3);
    expect(evaluation.summaryRows[0]?.["Total cost"]).toBe("$0.00000825");
    expect(evaluation.summaryRows[1]?.["Total cost"]).toBe("—");
    expect(console.table).toHaveBeenCalledTimes(2);
  });

  it("calculates model cost with cached input pricing", () => {
    expect(
      calculateEvaluationCost("gpt-5.4-nano-2026-03-17", {
        inputTokens: 1_000_000,
        cachedInputTokens: 100_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
      }),
    ).toBeCloseTo(1.432);
    expect(
      calculateEvaluationCost("openai/gpt-oss-120b:nitro", {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        costUsd: 0.00042,
      }),
    ).toBe(0.00042);
    expect(
      calculateEvaluationCost("unknown-model", {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      }),
    ).toBeNull();
  });

  it("does not retain partial rows when a model omits a result", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const evaluation = await runProductCategorizationEvaluation({
      concepts,
      items: ["Apples", "Bananas"],
      models: [evaluationModel("partial-model")],
      categorize: async () => ({
        results: [
          {
            key: "0",
            itemName: "Apples",
            quantityText: null,
            resolution: {
              kind: "existing",
              productConceptId: "apples",
            },
          },
        ],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    });

    expect(evaluation.resultRows).toEqual([
      expect.objectContaining({
        Model: "partial-model",
        "Submitted text": "Apples",
        Error: "Error",
      }),
      expect.objectContaining({
        Model: "partial-model",
        "Submitted text": "Bananas",
        Error: "Error",
      }),
    ]);
  });

  it("prints reconciliation messages but hides provider error messages", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const reconciliationFailure = await runProductCategorizationEvaluation({
      concepts,
      items: ["Apples"],
      models: [evaluationModel("model")],
      categorize: async () => {
        throw new ProductCategorizationError("Unknown concept: invented-id.");
      },
    });
    const providerFailure = await runProductCategorizationEvaluation({
      concepts,
      items: ["Apples"],
      models: [evaluationModel("model")],
      categorize: async () => {
        throw new Error("provider body should stay private");
      },
    });

    expect(reconciliationFailure.resultRows[0]?.Error).toBe(
      "Unknown concept: invented-id.",
    );
    expect(providerFailure.resultRows[0]?.Error).toBe("Error");
  });
});
