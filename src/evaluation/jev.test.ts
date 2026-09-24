import { afterEach, expect, it, vi } from "vitest";

import { classifyWithJev, JEV_EVALUATION_CASES } from "./jev";
import { curatedProductConcepts } from "@/services/product-catalog";

afterEach(() => vi.unstubAllGlobals());

const concepts = [
  {
    id: "rice-id",
    canonicalName: "rice",
    normalizedName: "rice",
    excludedTerms: ["rice vinegar"],
  },
];
const request = { apiKey: "test-key", items: ["rice vinegar"], concepts };
function mockResponse(choice: string, cost?: number) {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        model: "typesafe/jev-snapshot",
        answers: { item_0: { type: "choice", choice, confidence: 0.8 } },
        usage: {
          input_tokens: 100,
          output_tokens: 0,
          ...(cost === undefined ? {} : { cost }),
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("uses Decisions with exclusions and no-match, preserving absent cost as unknown", async () => {
  const fetch = mockResponse("no_match");
  expect(await classifyWithJev(request)).toMatchObject({
    results: [{ key: "0", concept: null, confidence: 0.8 }],
    costUsd: null,
  });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
  const body = JSON.parse(options.body);
  expect(body.state).toEqual({ items: ["rice vinegar"] });
  expect(body.questions.item_0.criteria.concept_0).toContain("rice vinegar");
  expect(body.questions.item_0.criteria.no_match).toBeTruthy();
});

it("maps an option to a concept and preserves zero cost", async () => {
  mockResponse("concept_0", 0);
  expect(await classifyWithJev(request)).toMatchObject({
    results: [{ key: "0", concept: "rice" }],
    costUsd: 0,
  });
});

it("rejects invented options instead of scoring them as no-match", async () => {
  mockResponse("invented");
  await expect(classifyWithJev(request)).rejects.toThrow("unknown choice");
});

it("rejects malformed answers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ answers: {} }))),
  );
  await expect(classifyWithJev(request)).rejects.toThrow();
});

it("reports HTTP status without exposing provider bodies", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("private provider details", { status: 429 }),
      ),
  );
  await expect(classifyWithJev(request)).rejects.toThrow(
    /^OpenRouter Decisions HTTP 429$/,
  );
});

it("keeps every labeled concept in the evaluation catalog", () => {
  const names = new Set<string>(
    curatedProductConcepts.map((concept) => concept.canonicalName),
  );
  for (const [, expected] of JEV_EVALUATION_CASES) {
    if (expected !== null) expect(names.has(expected)).toBe(true);
  }
});

it("submits the whole list once and reconciles answers by question id", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        model: "snapshot",
        answers: {
          item_1: { type: "choice", choice: "concept_0" },
          item_0: { type: "choice", choice: "no_match" },
        },
        usage: { input_tokens: 200, output_tokens: 0, cost: 0.001 },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await classifyWithJev({
    ...request,
    items: ["rice vinegar", "rice"],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.state.items).toEqual(["rice vinegar", "rice"]);
  expect(Object.keys(body.questions)).toEqual(["item_0", "item_1"]);
  expect(body.questions.item_0.instructions).toContain("state.items[0]");
  expect(body.questions.item_1.instructions).toContain("state.items[1]");
  expect(result.results).toEqual([
    { key: "0", concept: null, confidence: null },
    { key: "1", concept: "rice", confidence: null },
  ]);
  expect(result.costUsd).toBe(0.001);
});

it("rejects an incomplete batch", async () => {
  mockResponse("no_match");
  await expect(
    classifyWithJev({ ...request, items: ["rice vinegar", "rice"] }),
  ).rejects.toThrow("exactly one answer per item");
});

it("rejects unexpected question ids even when the count matches", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "snapshot",
          answers: { item_99: { type: "choice", choice: "no_match" } },
          usage: { input_tokens: 100, output_tokens: 0 },
        }),
      ),
    ),
  );
  await expect(classifyWithJev(request)).rejects.toThrow(
    "exactly one answer per item",
  );
});
