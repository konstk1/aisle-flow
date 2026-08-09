import { NoObjectGeneratedError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  categorizeProductsWithOpenRouter: vi.fn(),
  getValidatedOpenRouterEnv: vi.fn(),
}));

vi.mock("@/env/schema", () => ({
  getValidatedOpenRouterEnv: mocks.getValidatedOpenRouterEnv,
}));
vi.mock("./openrouter-product-categorizer-core", () => ({
  categorizeProductsWithOpenRouter: mocks.categorizeProductsWithOpenRouter,
}));

import {
  categorizeProductsWithProductionModel,
  PRODUCTION_PRODUCT_CATEGORIZATION_MODEL,
} from "./product-categorizer";

const request = {
  items: [{ key: "0", submittedText: "Apples 2" }],
  concepts: [
    {
      id: "database-apples-id",
      canonicalName: "Apples",
      normalizedName: "apples",
      excludedTerms: [],
    },
  ],
};

function structuredOutputError({
  finishReason = "other",
  id,
  text,
}: {
  finishReason?: "length" | "other";
  id: string;
  text: string;
}) {
  return new NoObjectGeneratedError({
    cause: new Error(`private cause for ${text}`),
    finishReason,
    response: {
      id,
      modelId: "upstream-gpt-oss-120b",
      timestamp: new Date("2026-08-09T12:00:00Z"),
    },
    text,
    usage: {
      inputTokens: 25,
      inputTokenDetails: {
        noCacheTokens: 25,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokens: 10,
      outputTokenDetails: { textTokens: 4, reasoningTokens: 6 },
      totalTokens: 35,
    },
  });
}

describe("production product categorizer", () => {
  beforeEach(() => {
    mocks.categorizeProductsWithOpenRouter.mockReset();
    mocks.getValidatedOpenRouterEnv.mockReset();
    mocks.getValidatedOpenRouterEnv.mockReturnValue({
      OPENROUTER_API_KEY: "test-openrouter-api-key",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the OpenRouter GPT-OSS Nitro model", async () => {
    const result = { results: [], usage: {} };
    mocks.categorizeProductsWithOpenRouter.mockResolvedValue(result);

    await expect(categorizeProductsWithProductionModel(request)).resolves.toBe(
      result,
    );

    expect(PRODUCTION_PRODUCT_CATEGORIZATION_MODEL).toBe(
      "openai/gpt-oss-120b:nitro",
    );
    expect(mocks.getValidatedOpenRouterEnv).toHaveBeenCalledWith(process.env);
    expect(mocks.categorizeProductsWithOpenRouter).toHaveBeenCalledWith({
      apiKey: "test-openrouter-api-key",
      modelId: "openai/gpt-oss-120b:nitro",
      request,
    });
  });

  it("retries invalid structured output once", async () => {
    const result = { results: [], usage: {} };
    mocks.categorizeProductsWithOpenRouter
      .mockRejectedValueOnce(
        structuredOutputError({ id: "response-1", text: "private output" }),
      )
      .mockResolvedValueOnce(result);

    await expect(categorizeProductsWithProductionModel(request)).resolves.toBe(
      result,
    );

    expect(mocks.categorizeProductsWithOpenRouter).toHaveBeenCalledTimes(2);
  });

  it("logs safe metadata after the structured-output retry is exhausted", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const firstError = structuredOutputError({
      id: "response-1",
      text: "first private output",
    });
    const finalError = structuredOutputError({
      finishReason: "length",
      id: "response-2",
      text: "final private output",
    });
    mocks.categorizeProductsWithOpenRouter
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(finalError);

    await expect(categorizeProductsWithProductionModel(request)).rejects.toBe(
      finalError,
    );

    expect(consoleError).toHaveBeenCalledWith(
      "Product categorization returned invalid structured output after retry.",
      {
        finishReason: "length",
        inputTokens: 25,
        modelId: "openai/gpt-oss-120b:nitro",
        outputTokens: 10,
        responseId: "response-2",
        responseModelId: "upstream-gpt-oss-120b",
        totalTokens: 35,
      },
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private");
  });

  it("does not retry other provider failures", async () => {
    const error = new Error("provider failed");
    mocks.categorizeProductsWithOpenRouter.mockRejectedValue(error);

    await expect(categorizeProductsWithProductionModel(request)).rejects.toBe(
      error,
    );
    expect(mocks.categorizeProductsWithOpenRouter).toHaveBeenCalledTimes(1);
  });
});
