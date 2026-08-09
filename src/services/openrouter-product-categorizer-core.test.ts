import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn((modelId: string, settings) => ({ modelId, settings })),
  createOpenRouter: vi.fn(),
  generateText: vi.fn(),
  outputObject: vi.fn((options) => options),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.outputObject },
}));

import { PRODUCT_CATEGORIZATION_SYSTEM_PROMPT } from "./openai-product-categorizer-core";
import { categorizeProductsWithOpenRouter } from "./openrouter-product-categorizer-core";

const modelId = "openai/gpt-oss-120b:nitro";

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

describe("OpenRouter product categorizer", () => {
  beforeEach(() => {
    mocks.chat.mockClear();
    mocks.createOpenRouter.mockReset();
    mocks.createOpenRouter.mockReturnValue({ chat: mocks.chat });
    mocks.generateText.mockReset();
    mocks.outputObject.mockClear();
  });

  it("uses the Nitro model with structured output and provider-reported cost", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        results: [
          {
            key: "0",
            itemName: "Apples",
            quantityText: "2",
            resolution: {
              kind: "existing",
              existingConceptName: "Apples",
              suggestedConceptName: null,
            },
          },
        ],
      },
      providerMetadata: {
        openrouter: {
          usage: {
            promptTokens: 25,
            completionTokens: 10,
            totalTokens: 35,
            cost: 0.00042,
          },
        },
      },
      usage: {
        inputTokens: 25,
        inputTokenDetails: { cacheReadTokens: 5 },
        outputTokens: 10,
        totalTokens: 35,
      },
    });

    const result = await categorizeProductsWithOpenRouter({
      apiKey: "test-openrouter-api-key",
      modelId,
      request,
    });

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "test-openrouter-api-key",
      appName: "Aisle Flow",
      compatibility: "strict",
    });
    expect(mocks.chat).toHaveBeenCalledWith(modelId, {
      plugins: [{ id: "response-healing" }],
      provider: { require_parameters: true },
      reasoning: { effort: "low" },
      structuredOutputs: { strict: false },
      usage: { include: true },
    });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.not.objectContaining({ providerOptions: expect.anything() }),
    );
    expect(result.usage).toEqual({
      inputTokens: 25,
      cachedInputTokens: 5,
      outputTokens: 10,
      totalTokens: 35,
      costUsd: 0.00042,
    });
  });

  it("returns a null billed cost when OpenRouter omits usage metadata", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        results: [
          {
            key: "0",
            itemName: "Apples",
            quantityText: null,
            resolution: {
              kind: "existing",
              existingConceptName: "Apples",
              suggestedConceptName: null,
            },
          },
        ],
      },
      usage: {},
    });

    const result = await categorizeProductsWithOpenRouter({
      apiKey: "test-openrouter-api-key",
      modelId,
      request,
    });

    expect(result.usage.costUsd).toBeNull();
  });

  it("keeps the explicit result-wrapper instruction required by non-strict output", () => {
    expect(PRODUCT_CATEGORIZATION_SYSTEM_PROMPT).toContain(
      "Return a top-level JSON object whose results property is the result array; never wrap that array in an items object.",
    );
  });
});
