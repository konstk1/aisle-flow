import { loadEnvConfig } from "@next/env";

import { createDatabase } from "@/db/create-client";
import { parseDatabaseUrl, getValidatedOpenAiEnv } from "@/env/schema";
import {
  EVALUATION_ITEMS,
  EVALUATION_MODELS,
  runProductCategorizationEvaluation,
} from "@/evaluation/product-categorization";
import { categorizeProductsWithOpenAI } from "@/services/openai-product-categorizer-core";
import { loadProductConceptCatalog } from "@/services/product-concept-catalog";

loadEnvConfig(process.cwd());

async function run() {
  const databaseUrl = parseDatabaseUrl(process.env.DATABASE_URL);
  const { OPENAI_API_KEY } = getValidatedOpenAiEnv(process.env);
  const db = createDatabase(databaseUrl);
  const concepts = await loadProductConceptCatalog(db);
  const evaluation = await runProductCategorizationEvaluation({
    concepts,
    items: EVALUATION_ITEMS,
    models: EVALUATION_MODELS,
    categorize: ({ concepts: catalog, items, modelId }) =>
      categorizeProductsWithOpenAI({
        apiKey: OPENAI_API_KEY,
        modelId,
        request: {
          concepts: catalog,
          items: items.map((submittedText, index) => ({
            key: String(index),
            submittedText,
          })),
        },
      }),
  });

  if (evaluation.failed) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error("Product categorization evaluation could not start.", {
    errorClass: error instanceof Error ? error.constructor.name : typeof error,
  });
  process.exitCode = 1;
});
