import { writeFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";

import { normalizeProductText } from "@/domain/product-matching";
import { getValidatedOpenRouterEnv } from "@/env/schema";
import {
  classifyWithJev,
  JEV_EVALUATION_CASES,
  JEV_MODEL,
} from "@/evaluation/jev";
import { categorizeProductsWithOpenRouter } from "@/services/openrouter-product-categorizer-core";
import { PRODUCTION_PRODUCT_CATEGORIZATION_MODEL } from "@/services/product-categorization-model";
import { curatedProductConcepts } from "@/services/product-catalog";

loadEnvConfig(process.cwd());

async function run() {
  const repeats = Number(process.env.EVAL_REPEATS ?? 1);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) {
    throw new Error("EVAL_REPEATS must be an integer from 1 to 10.");
  }
  let apiKey: string;
  try {
    apiKey = getValidatedOpenRouterEnv(process.env).OPENROUTER_API_KEY;
  } catch {
    console.error(
      "Configure OPENROUTER_API_KEY in .env.local before running pnpm eval:jev.",
    );
    process.exitCode = 1;
    return;
  }
  const concepts = curatedProductConcepts.map((concept) => ({
    ...concept,
    id: concept.canonicalName,
    normalizedName: normalizeProductText(concept.canonicalName),
  }));
  const rows: {
    repeat: number;
    model: string;
    submittedText: string;
    expected: string | null;
    concept: string | null;
    confidence: number | null;
    correct: boolean;
    error: string | null;
  }[] = [];
  const batches: {
    repeat: number;
    model: string;
    responseModel: string | null;
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    error: string | null;
  }[] = [];
  const items = JEV_EVALUATION_CASES.map(([submittedText]) => submittedText);
  for (let repeat = 0; repeat < repeats; repeat++) {
    const models = [PRODUCTION_PRODUCT_CATEGORIZATION_MODEL, JEV_MODEL];
    if (repeat % 2) models.reverse();
    for (const model of models) {
      const started = performance.now();
      const base = { repeat: repeat + 1, model };
      try {
        let batch;
        if (model === JEV_MODEL) {
          batch = await classifyWithJev({ apiKey, items, concepts });
        } else {
          const result = await categorizeProductsWithOpenRouter({
            apiKey,
            modelId: model,
            request: {
              concepts,
              items: items.map((submittedText, index) => ({
                key: String(index),
                submittedText,
              })),
            },
          });
          batch = {
            results: result.results.map(({ key, resolution }) => ({
              key,
              concept:
                resolution.kind === "existing"
                  ? resolution.productConceptId
                  : null,
              confidence: null,
            })),
            responseModel: null,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            costUsd: result.usage.costUsd ?? null,
          };
        }
        const byKey = new Map(
          batch.results.map((result) => [result.key, result]),
        );
        const batchRows = JEV_EVALUATION_CASES.map(
          ([submittedText, expected], index) => {
            const result = byKey.get(String(index));
            if (!result) throw new Error("Missing evaluation result.");
            return {
              ...base,
              submittedText,
              expected,
              concept: result.concept,
              confidence: result.confidence,
              correct: result.concept === expected,
              error: null,
            };
          },
        );
        rows.push(...batchRows);
        batches.push({
          ...base,
          responseModel: batch.responseModel,
          inputTokens: batch.inputTokens,
          outputTokens: batch.outputTokens,
          costUsd: batch.costUsd,
          durationMs: Math.round(performance.now() - started),
          error: null,
        });
      } catch (error) {
        const description =
          error instanceof Error
            ? error.name +
              (error.message.startsWith("OpenRouter Decisions HTTP")
                ? `: ${error.message}`
                : "")
            : "Unknown error";
        rows.push(
          ...JEV_EVALUATION_CASES.map(([submittedText, expected]) => ({
            ...base,
            submittedText,
            expected,
            concept: null,
            confidence: null,
            correct: false,
            error: description,
          })),
        );
        batches.push({
          ...base,
          responseModel: null,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          durationMs: Math.round(performance.now() - started),
          error: description,
        });
        process.exitCode = 1;
      }
      console.info(
        `${batches.length}/${repeats * 2} batches: ${model} / ${items.length} items`,
      );
    }
  }
  const summary = [PRODUCTION_PRODUCT_CATEGORIZATION_MODEL, JEV_MODEL].map(
    (model) => {
      const results = rows.filter((row) => row.model === model);
      const modelBatches = batches.filter((batch) => batch.model === model);
      const durations = modelBatches
        .map((batch) => batch.durationMs)
        .sort((a, b) => a - b);
      const costs = modelBatches.map((batch) => batch.costUsd);
      return {
        model,
        correct: results.filter((row) => row.correct).length,
        total: results.length,
        errors: results.filter((row) => row.error).length,
        accuracy: results.filter((row) => row.correct).length / results.length,
        batches: modelBatches.length,
        medianBatchMs:
          (durations[Math.floor((durations.length - 1) / 2)] +
            durations[Math.floor(durations.length / 2)]) /
          2,
        p95BatchMs: durations[Math.ceil(durations.length * 0.95) - 1],
        costUsd: costs.every((cost) => cost !== null)
          ? costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)
          : null,
      };
    },
  );
  console.table(
    rows.map(({ model, submittedText, expected, concept, correct, error }) => ({
      model,
      submittedText,
      expected,
      concept,
      correct,
      error,
    })),
  );
  console.table(summary);
  const report = {
    createdAt: new Date().toISOString(),
    repeats,
    catalog: concepts,
    cases: JEV_EVALUATION_CASES,
    summary,
    batches,
    rows,
  };
  if (process.env.EVAL_OUTPUT)
    await writeFile(
      process.env.EVAL_OUTPUT,
      JSON.stringify(report, null, 2) + "\n",
    );
}

run().catch((error: unknown) => {
  console.error(
    "Jev evaluation could not complete.",
    error instanceof Error ? error.name : "Unknown error",
  );
  process.exitCode = 1;
});
