import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(() => vi.fn((modelId: string) => ({ modelId }))),
  generateText: vi.fn(),
  outputObject: vi.fn((options) => options),
}));

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.outputObject },
}));

import {
  categorizeProductsWithOpenAI,
  openAIProviderOptionsForModel,
  PRODUCT_CATEGORIZATION_MODEL,
  PRODUCT_CATEGORIZATION_SYSTEM_PROMPT,
} from "./openai-product-categorizer-core";

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

describe("OpenAI product categorizer", () => {
  beforeEach(() => {
    mocks.createOpenAI.mockClear();
    mocks.generateText.mockReset();
    mocks.outputObject.mockClear();
  });

  it("uses structured output and returns reconciled usage", async () => {
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
      usage: {
        inputTokens: 25,
        inputTokenDetails: { cacheReadTokens: 5 },
        outputTokens: 10,
        totalTokens: 35,
      },
    });

    const result = await categorizeProductsWithOpenAI({
      apiKey: "test-api-key-that-is-long-enough",
      modelId: "test-model",
      request,
    });

    expect(result.results[0]).toMatchObject({
      itemName: "Apples",
      quantityText: "2",
      resolution: {
        kind: "existing",
        productConceptId: "database-apples-id",
      },
    });
    expect(result.usage).toEqual({
      inputTokens: 25,
      cachedInputTokens: 5,
      outputTokens: 10,
      totalTokens: 35,
    });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: PRODUCT_CATEGORIZATION_SYSTEM_PROMPT,
        timeout: 10_000,
        providerOptions: {
          openai: { reasoningEffort: "none", store: false },
        },
      }),
    );
    const providerPrompt = mocks.generateText.mock.calls[0]?.[0].prompt;
    expect(providerPrompt).toContain('"canonicalName":"Apples"');
    expect(providerPrompt).not.toContain('"id":');
    expect(providerPrompt).not.toContain("database-apples-id");
    const providerSchema = mocks.outputObject.mock.calls[0]?.[0].schema;
    expect(
      providerSchema.safeParse({
        results: [
          {
            key: "0",
            itemName: "Apples",
            quantityText: null,
            resolution: {
              kind: "existing",
              existingConceptName: "Invented concept",
              suggestedConceptName: null,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("uses GPT-5 nano as the production default", () => {
    expect(PRODUCT_CATEGORIZATION_MODEL).toBe("gpt-5-nano-2025-08-07");
  });

  it("rejects incomplete structured results", async () => {
    mocks.generateText.mockResolvedValue({
      output: { results: [] },
      usage: {},
    });

    await expect(
      categorizeProductsWithOpenAI({
        apiKey: "test-api-key-that-is-long-enough",
        modelId: "test-model",
        request,
      }),
    ).rejects.toThrow("exactly one result");
  });

  it("propagates provider failures", async () => {
    mocks.generateText.mockRejectedValue(new Error("provider failed"));

    await expect(
      categorizeProductsWithOpenAI({
        apiKey: "test-api-key-that-is-long-enough",
        modelId: "test-model",
        request,
      }),
    ).rejects.toThrow("provider failed");
  });

  it("uses model-compatible reasoning options", () => {
    expect(openAIProviderOptionsForModel("gpt-5.4-nano-2026-03-17")).toEqual({
      reasoningEffort: "none",
      store: false,
    });
    expect(openAIProviderOptionsForModel("gpt-5-nano-2025-08-07")).toEqual({
      reasoningEffort: "minimal",
      store: false,
    });
    expect(openAIProviderOptionsForModel("gpt-4o-mini-2024-07-18")).toEqual({
      store: false,
    });
  });
});
