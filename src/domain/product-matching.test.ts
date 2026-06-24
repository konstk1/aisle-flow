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
];

const catalog: ProductMatchingCatalog = {
  concepts,
  curatedTerms: [
    { productConceptId: "vinegar", text: "rice vinegar" },
    { productConceptId: "vinegar", text: "apple cider vinegar" },
    { productConceptId: "produce", text: "broccoli" },
    { productConceptId: "produce", text: "peas" },
  ],
  qualifierRules: [
    {
      qualifier: "fresh",
      productTerms: ["broccoli", "peas"],
      productConceptId: "produce",
    },
    {
      qualifier: "frozen",
      productTerms: ["broccoli", "peas"],
      productConceptId: "frozen-vegetables",
    },
    {
      qualifier: "canned",
      productTerms: ["broccoli", "peas"],
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
    "never resolves %s to rice through its broad category term",
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

  it("requires correction for conflicting qualifiers", () => {
    expect(
      resolveProductMatch({ text: "fresh frozen broccoli", catalog }),
    ).toMatchObject({
      state: "needs-user-correction",
      source: "unresolved",
    });
  });
});
