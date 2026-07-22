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
    canonicalName: "apple sauce",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "beans",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "butter",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "canned vegetables",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "cereal",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "cheese",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "chips",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "coffee",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "dairy",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "deli",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "fish",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "frozen breakfast",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "frozen vegetables",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "grains",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "granola",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "ice cream",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "juice",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "meat",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "nuts",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "orange juice",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "pancakes",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "paper goods",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "pasta",
    terms: [],
    excludedTerms: [],
  },
  produceConcept,
  {
    canonicalName: "rice",
    terms: [],
    excludedTerms: ["rice vinegar", "rice cakes", "rice noodles"],
  },
  {
    canonicalName: "seasoning",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "tea",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "vinegar",
    terms: ["rice vinegar", "apple cider vinegar", "white vinegar"],
    excludedTerms: [],
  },
  {
    canonicalName: "water",
    terms: [],
    excludedTerms: [],
  },
  {
    canonicalName: "yogurt",
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
