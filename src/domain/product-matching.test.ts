import { describe, expect, it } from "vitest";

import {
  normalizeProductText,
  resolveProductMatch,
  type ProductMatchConcept,
  type ProductMatchingCatalog,
} from "./product-matching";

const concepts: ProductMatchConcept[] = [
  {
    id: "rice",
    canonicalName: "rice",
    normalizedName: "rice",
    excludedTerms: ["rice vinegar", "rice cakes", "rice noodles"],
  },
  {
    id: "vinegar",
    canonicalName: "vinegar",
    normalizedName: "vinegar",
    excludedTerms: [],
  },
  {
    id: "produce",
    canonicalName: "produce",
    normalizedName: "produce",
    excludedTerms: [],
  },
  {
    id: "frozen-vegetables",
    canonicalName: "frozen vegetables",
    normalizedName: "frozen vegetables",
    excludedTerms: [],
  },
  {
    id: "canned-vegetables",
    canonicalName: "canned vegetables",
    normalizedName: "canned vegetables",
    excludedTerms: [],
  },
  {
    id: "dairy",
    canonicalName: "dairy",
    normalizedName: "dairy",
    excludedTerms: [],
  },
];

const catalog: ProductMatchingCatalog = {
  concepts,
  curatedTerms: [
    { productConceptId: "vinegar", text: "rice vinegar" },
    { productConceptId: "vinegar", text: "apple cider vinegar" },
    { productConceptId: "produce", text: "broccoli" },
    { productConceptId: "produce", text: "peas" },
    { productConceptId: "produce", text: "green beans" },
    { productConceptId: "dairy", text: "greek yogurt" },
    { productConceptId: "dairy", text: "yogurt" },
  ],
  qualifierRules: [
    {
      qualifier: "fresh",
      productTerms: ["broccoli", "peas", "green beans"],
      productConceptId: "produce",
    },
    {
      qualifier: "frozen",
      productTerms: ["broccoli", "peas", "green beans"],
      productConceptId: "frozen-vegetables",
    },
    {
      qualifier: "canned",
      productTerms: ["broccoli", "peas", "green beans"],
      productConceptId: "canned-vegetables",
    },
  ],
};

describe("normalizeProductText", () => {
  it("makes equivalent display text safe to match without preserving it", () => {
    expect(normalizeProductText("  JASMINE—RICE  ")).toBe("jasmine rice");
    expect(normalizeProductText("Cafés' vinegar")).toBe("cafes vinegar");
  });
});

describe("resolveProductMatch", () => {
  it.each([
    ["jasmine rice", "rice"],
    ["brown rice", "rice"],
    ["frozen peas", "frozen-vegetables"],
    ["frozen broccoli", "frozen-vegetables"],
    ["fresh broccoli", "produce"],
    ["rice vinegar", "vinegar"],
  ])("maps %s to %s", (text, conceptId) => {
    const result = resolveProductMatch({ text, catalog });

    expect(result).toMatchObject({
      state: "matched",
      rawText: text,
      productConcept: { id: conceptId },
    });
  });

  it("uses configured department qualifiers as the matching source", () => {
    const result = resolveProductMatch({ text: "frozen broccoli", catalog });

    expect(result).toMatchObject({
      state: "matched",
      source: "qualifier",
      confidence: 0.99,
    });
  });

  it.each(["rice vinegar", "rice cakes", "rice noodles"])(
    "never resolves %s to rice through its broad concept term",
    (text) => {
      const result = resolveProductMatch({ text, catalog });

      expect(result).not.toMatchObject({ productConcept: { id: "rice" } });
    },
  );

  it("lets an exact learned alias override curated matching", () => {
    const result = resolveProductMatch({
      text: "wild rice",
      catalog,
      learnedAlias: {
        normalizedText: "wild rice",
        productConcept: concepts[1],
        confidence: 1,
      },
    });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "vinegar" },
      source: "learned-alias",
      confidence: 1,
    });
  });

  it("ignores a learned alias with non-positive confidence", () => {
    const result = resolveProductMatch({
      text: "wild rice",
      catalog,
      learnedAlias: {
        normalizedText: "wild rice",
        productConcept: concepts[1],
        confidence: 0,
      },
    });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "rice" },
      source: "canonical-name",
      confidence: 0.95,
    });
  });

  it("corrects only high-confidence minor misspellings", () => {
    const result = resolveProductMatch({ text: "brocolli", catalog });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "produce" },
      source: "typo-correction",
      confidence: 0.91,
    });
  });

  it("does not fuzzy-match short or insufficiently similar inputs", () => {
    expect(resolveProductMatch({ text: "rise", catalog })).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
    expect(
      resolveProductMatch({ text: "broccolli florets", catalog }),
    ).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
  });

  it("chooses the closest typo candidate before the more specific term", () => {
    const result = resolveProductMatch({
      text: "cheece",
      catalog: {
        concepts: [
          {
            id: "cheese",
            canonicalName: "cheese",
            normalizedName: "cheese",
            excludedTerms: [],
          },
          {
            id: "cheecees",
            canonicalName: "cheecees",
            normalizedName: "cheecees",
            excludedTerms: [],
          },
        ],
        curatedTerms: [],
        qualifierRules: [],
      },
    });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "cheese" },
      source: "typo-correction",
    });
  });

  it("requires correction when different concepts tie for a typo correction", () => {
    const result = resolveProductMatch({
      text: "spoces",
      catalog: {
        concepts: [
          {
            id: "spices",
            canonicalName: "spices",
            normalizedName: "spices",
            excludedTerms: [],
          },
          {
            id: "spaces",
            canonicalName: "spaces",
            normalizedName: "spaces",
            excludedTerms: [],
          },
        ],
        curatedTerms: [],
        qualifierRules: [],
      },
    });

    expect(result).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
  });

  it("corrects a multi-word misspelling against a multi-word term", () => {
    const result = resolveProductMatch({ text: "greek yogrt", catalog });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "dairy" },
      source: "typo-correction",
      confidence: 0.91,
    });
  });

  it("remaps a typo-corrected term through a department qualifier", () => {
    const result = resolveProductMatch({ text: "frozen brocoli", catalog });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "frozen-vegetables" },
      source: "typo-correction",
      confidence: 0.91,
    });
  });

  it("remaps a misspelled multi-word term through a department qualifier", () => {
    const result = resolveProductMatch({ text: "frozen grean beans", catalog });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "frozen-vegetables" },
      source: "typo-correction",
      confidence: 0.91,
    });
  });

  it("requires correction when multi-word terms from different concepts tie", () => {
    const result = resolveProductMatch({
      text: "grean beans",
      catalog: {
        concepts: [
          {
            id: "green-beans",
            canonicalName: "green beans",
            normalizedName: "green beans",
            excludedTerms: [],
          },
          {
            id: "great-beans",
            canonicalName: "great beans",
            normalizedName: "great beans",
            excludedTerms: [],
          },
        ],
        curatedTerms: [],
        qualifierRules: [],
      },
    });

    expect(result).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
  });

  it("does not fuzzy-match when the word counts diverge", () => {
    expect(
      resolveProductMatch({ text: "organic yogrt", catalog }),
    ).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
  });

  it("applies the short-term floor to multi-word terms", () => {
    const result = resolveProductMatch({
      text: "pb k",
      catalog: {
        concepts: [
          {
            id: "pb-j",
            canonicalName: "pb j",
            normalizedName: "pb j",
            excludedTerms: [],
          },
        ],
        curatedTerms: [],
        qualifierRules: [],
      },
    });

    expect(result).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
  });

  it("repairs a missing space against a multi-word term", () => {
    const result = resolveProductMatch({ text: "ricevinegar", catalog });

    expect(result).toMatchObject({
      state: "matched",
      productConcept: { id: "vinegar" },
      source: "typo-correction",
      confidence: 0.91,
    });
  });

  it("requires correction for conflicting qualifiers", () => {
    expect(
      resolveProductMatch({ text: "fresh frozen broccoli", catalog }),
    ).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
  });
});
