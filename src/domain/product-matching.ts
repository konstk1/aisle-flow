export type ProductMatchSource =
  | "learned-alias"
  | "canonical-name"
  | "curated-term"
  | "qualifier"
  | "typo-correction"
  | "unresolved";

export interface ProductMatchConcept {
  id: string;
  canonicalName: string;
  normalizedName: string;
  excludedTerms: readonly string[];
}

export interface CuratedProductTerm {
  productConceptId: string;
  text: string;
}

export interface ProductQualifierRule {
  qualifier: string;
  productTerms: readonly string[];
  productConceptId: string;
}

export interface ProductMatchingCatalog {
  concepts: readonly ProductMatchConcept[];
  curatedTerms: readonly CuratedProductTerm[];
  qualifierRules: readonly ProductQualifierRule[];
}

export interface LearnedProductAlias {
  normalizedText: string;
  productConcept: ProductMatchConcept;
  confidence: number;
}

export interface MatchedProductResult {
  state: "matched";
  rawText: string;
  normalizedText: string;
  productConcept: ProductMatchConcept;
  confidence: number;
  source: Exclude<ProductMatchSource, "unresolved">;
  rationale: string;
}

export interface NeedsUserCorrectionResult {
  state: "needs-user-correction";
  rawText: string;
  normalizedText: string;
  productConcept: null;
  confidence: 0;
  source: "unresolved";
  rationale: string;
}

export type ProductMatchResult =
  | MatchedProductResult
  | NeedsUserCorrectionResult;

interface TermCandidate {
  productConcept: ProductMatchConcept;
  matchedTerm: string;
  source: "canonical-name" | "curated-term" | "qualifier" | "typo-correction";
  confidence: number;
  qualifier?: string;
}

export function normalizeProductText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function resolveProductMatch({
  text,
  catalog,
  learnedAlias,
}: {
  text: string;
  catalog: ProductMatchingCatalog;
  learnedAlias?: LearnedProductAlias | null;
}): ProductMatchResult {
  const normalizedText = normalizeProductText(text);

  if (!normalizedText) {
    return needsUserCorrection(
      text,
      normalizedText,
      "Enter a product name before choosing a shelf category.",
    );
  }

  if (
    learnedAlias &&
    normalizeProductText(learnedAlias.normalizedText) === normalizedText
  ) {
    return {
      state: "matched",
      rawText: text,
      normalizedText,
      productConcept: learnedAlias.productConcept,
      confidence: learnedAlias.confidence,
      source: "learned-alias",
      rationale: `Used the learned exact alias “${normalizedText}”.`,
    };
  }

  if (hasConflictingQualifiers(normalizedText, catalog.qualifierRules)) {
    return needsUserCorrection(
      text,
      normalizedText,
      "The entered text includes conflicting department qualifiers.",
    );
  }

  const directMatch = [
    ...findTermCandidates(normalizedText, catalog),
    ...findQualifierCandidates(normalizedText, catalog),
  ].sort(compareCandidates)[0];

  if (directMatch) {
    return toMatchedResult(text, normalizedText, directMatch);
  }

  const typoMatch = findTypoCandidate(normalizedText, catalog);
  if (typoMatch) {
    return toMatchedResult(text, normalizedText, typoMatch);
  }

  return needsUserCorrection(
    text,
    normalizedText,
    "No category matched with sufficient confidence.",
  );
}

function findTermCandidates(
  normalizedText: string,
  catalog: ProductMatchingCatalog,
) {
  const candidates: TermCandidate[] = [];

  for (const concept of catalog.concepts) {
    const canonicalName = normalizeProductText(concept.normalizedName);
    if (
      canonicalName &&
      containsPhrase(normalizedText, canonicalName) &&
      !isExcluded(normalizedText, concept)
    ) {
      candidates.push({
        productConcept: concept,
        matchedTerm: canonicalName,
        source: "canonical-name",
        confidence: 0.95,
      });
    }
  }

  for (const term of catalog.curatedTerms) {
    const concept = catalog.concepts.find(
      (candidate) => candidate.id === term.productConceptId,
    );
    const normalizedTerm = normalizeProductText(term.text);

    if (
      !concept ||
      !normalizedTerm ||
      !containsPhrase(normalizedText, normalizedTerm) ||
      isExcluded(normalizedText, concept)
    ) {
      continue;
    }

    candidates.push({
      productConcept: concept,
      matchedTerm: normalizedTerm,
      source: "curated-term",
      confidence: 0.97,
    });
  }

  return candidates;
}

function findQualifierCandidates(
  normalizedText: string,
  catalog: ProductMatchingCatalog,
) {
  const candidates: TermCandidate[] = [];

  for (const rule of catalog.qualifierRules) {
    const qualifier = normalizeProductText(rule.qualifier);
    if (!qualifier || !containsPhrase(normalizedText, qualifier)) {
      continue;
    }

    const concept = catalog.concepts.find(
      (candidate) => candidate.id === rule.productConceptId,
    );
    if (!concept) {
      continue;
    }

    const matchedTerm = rule.productTerms
      .map(normalizeProductText)
      .filter(Boolean)
      .filter((term) => containsPhrase(normalizedText, term))
      .sort(compareTermsBySpecificity)[0];

    if (!matchedTerm || isExcluded(normalizedText, concept)) {
      continue;
    }

    candidates.push({
      productConcept: concept,
      matchedTerm,
      source: "qualifier",
      confidence: 0.99,
      qualifier,
    });
  }

  return candidates;
}

function findTypoCandidate(
  normalizedText: string,
  catalog: ProductMatchingCatalog,
) {
  const qualifierWords = new Set(
    catalog.qualifierRules.map((rule) => normalizeProductText(rule.qualifier)),
  );
  const inputTerms = normalizedText
    .split(" ")
    .filter((term) => !qualifierWords.has(term));

  if (inputTerms.length !== 1) {
    return undefined;
  }

  const inputTerm = inputTerms[0];
  const candidates = findTermCandidatesForTypos(catalog)
    .filter(({ term }) => term.length >= 6)
    .filter(
      ({ term }) =>
        levenshteinDistance(inputTerm, term) <= maximumTypoDistance(term),
    )
    .filter(({ concept }) => !isExcluded(normalizedText, concept))
    .map(({ concept, term }) => ({
      productConcept: concept,
      matchedTerm: term,
      source: "typo-correction" as const,
      confidence: 0.91,
      qualifier: undefined,
    }))
    .sort((left, right) => {
      const specificity = compareTermsBySpecificity(
        left.matchedTerm,
        right.matchedTerm,
      );
      return specificity || right.confidence - left.confidence;
    });

  const candidate = candidates[0];
  if (!candidate) {
    return undefined;
  }

  if (
    candidates.some(
      (other) =>
        other.productConcept.id !== candidate.productConcept.id &&
        levenshteinDistance(inputTerm, other.matchedTerm) <=
          levenshteinDistance(inputTerm, candidate.matchedTerm),
    )
  ) {
    return undefined;
  }

  const matchingRule = catalog.qualifierRules.find((rule) => {
    const qualifier = normalizeProductText(rule.qualifier);
    return (
      qualifier &&
      containsPhrase(normalizedText, qualifier) &&
      rule.productTerms
        .map(normalizeProductText)
        .some((term) => term === candidate.matchedTerm)
    );
  });

  if (!matchingRule) {
    return candidate;
  }

  const qualifiedConcept = catalog.concepts.find(
    (concept) => concept.id === matchingRule.productConceptId,
  );
  if (!qualifiedConcept || isExcluded(normalizedText, qualifiedConcept)) {
    return candidate;
  }

  return {
    ...candidate,
    productConcept: qualifiedConcept,
    qualifier: normalizeProductText(matchingRule.qualifier),
  };
}

function findTermCandidatesForTypos(catalog: ProductMatchingCatalog) {
  const terms = new Map<
    string,
    {
      concept: ProductMatchConcept;
      term: string;
      source: "canonical-name" | "curated-term";
    }
  >();

  for (const concept of catalog.concepts) {
    const term = normalizeProductText(concept.normalizedName);
    if (term && !term.includes(" ")) {
      terms.set(`${concept.id}:${term}`, {
        concept,
        term,
        source: "canonical-name",
      });
    }
  }

  for (const curatedTerm of catalog.curatedTerms) {
    const concept = catalog.concepts.find(
      (candidate) => candidate.id === curatedTerm.productConceptId,
    );
    const term = normalizeProductText(curatedTerm.text);
    if (concept && term && !term.includes(" ")) {
      terms.set(`${concept.id}:${term}`, {
        concept,
        term,
        source: "curated-term",
      });
    }
  }

  return [...terms.values()];
}

function hasConflictingQualifiers(
  normalizedText: string,
  qualifierRules: readonly ProductQualifierRule[],
) {
  const qualifiers = new Set(
    qualifierRules
      .map((rule) => normalizeProductText(rule.qualifier))
      .filter((qualifier) => containsPhrase(normalizedText, qualifier)),
  );

  return qualifiers.size > 1;
}

function isExcluded(normalizedText: string, concept: ProductMatchConcept) {
  return concept.excludedTerms.some((excludedTerm) =>
    containsPhrase(normalizedText, normalizeProductText(excludedTerm)),
  );
}

function containsPhrase(text: string, phrase: string) {
  return ` ${text} `.includes(` ${phrase} `);
}

function compareCandidates(left: TermCandidate, right: TermCandidate) {
  const leftSpecificity =
    wordCount(left.matchedTerm) +
    (left.qualifier ? wordCount(left.qualifier) : 0);
  const rightSpecificity =
    wordCount(right.matchedTerm) +
    (right.qualifier ? wordCount(right.qualifier) : 0);

  return (
    rightSpecificity - leftSpecificity ||
    right.matchedTerm.length - left.matchedTerm.length ||
    right.confidence - left.confidence
  );
}

function compareTermsBySpecificity(left: string, right: string) {
  return wordCount(right) - wordCount(left) || right.length - left.length;
}

function wordCount(text: string) {
  return text.split(" ").length;
}

function toMatchedResult(
  rawText: string,
  normalizedText: string,
  candidate: TermCandidate,
): MatchedProductResult {
  const phrase = candidate.qualifier
    ? `${candidate.qualifier} ${candidate.matchedTerm}`
    : candidate.matchedTerm;
  const rationale =
    candidate.source === "typo-correction"
      ? `Corrected “${normalizedText}” to the curated term “${candidate.matchedTerm}”.`
      : candidate.source === "qualifier"
        ? `Matched “${phrase}” using a configured department qualifier.`
        : `Matched the ${candidate.source === "canonical-name" ? "canonical category" : "curated term"} “${candidate.matchedTerm}”.`;

  return {
    state: "matched",
    rawText,
    normalizedText,
    productConcept: candidate.productConcept,
    confidence: candidate.confidence,
    source: candidate.source,
    rationale,
  };
}

function needsUserCorrection(
  rawText: string,
  normalizedText: string,
  rationale: string,
): NeedsUserCorrectionResult {
  return {
    state: "needs-user-correction",
    rawText,
    normalizedText,
    productConcept: null,
    confidence: 0,
    source: "unresolved",
    rationale,
  };
}

function levenshteinDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous = current;
  }

  return previous[right.length];
}

function maximumTypoDistance(term: string) {
  return term.length >= 8 ? 2 : 1;
}
