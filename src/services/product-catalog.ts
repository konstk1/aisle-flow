import {
  normalizeProductText,
  type ProductQualifierRule,
} from "@/domain/product-matching";

export interface CuratedProductConceptDefinition {
  canonicalName: string;
  terms: readonly string[];
  excludedTerms: readonly string[];
}

interface CuratedQualifierRuleDefinition {
  qualifier: string;
  productTerms: readonly string[];
  targetCanonicalName: string;
}

const produceConcept = {
  canonicalName: "produce",
  terms: ["broccoli", "peas"],
  excludedTerms: [],
} as const satisfies CuratedProductConceptDefinition;

export const curatedProductConcepts = [
  {
    canonicalName: "rice",
    terms: [],
    excludedTerms: ["rice vinegar", "rice cakes", "rice noodles"],
  },
  {
    canonicalName: "vinegar",
    terms: ["rice vinegar", "apple cider vinegar", "white vinegar"],
    excludedTerms: [],
  },
  produceConcept,
  {
    canonicalName: "frozen vegetables",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "canned vegetables",
    terms: [],
    excludedTerms: [],
  },
] as const satisfies readonly CuratedProductConceptDefinition[];

export const curatedQualifierRules = [
  {
    qualifier: "fresh",
    productTerms: produceConcept.terms,
    targetCanonicalName: "produce",
  },
  {
    qualifier: "frozen",
    productTerms: produceConcept.terms,
    targetCanonicalName: "frozen vegetables",
  },
  {
    qualifier: "canned",
    productTerms: produceConcept.terms,
    targetCanonicalName: "canned vegetables",
  },
] as const satisfies readonly CuratedQualifierRuleDefinition[];

export function resolveCuratedQualifierRules(
  concepts: readonly { id: string; normalizedName: string }[],
) {
  const conceptIdsByName = new Map(
    concepts.map((concept) => [concept.normalizedName, concept.id]),
  );

  return curatedQualifierRules.flatMap((rule) => {
    const productConceptId = conceptIdsByName.get(
      normalizeProductText(rule.targetCanonicalName),
    );

    if (!productConceptId) {
      return [];
    }

    return [
      {
        qualifier: rule.qualifier,
        productTerms: rule.productTerms,
        productConceptId,
      } satisfies ProductQualifierRule,
    ];
  });
}
