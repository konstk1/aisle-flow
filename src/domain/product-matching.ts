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

export interface PreparedProductMatchingCatalog {
  kind: "prepared-product-matching-catalog";
  conceptsById: ReadonlyMap<string, ProductMatchConcept>;
  terms: readonly PreparedProductTerm[];
  typoCandidateTerms: readonly PreparedProductTerm[];
  qualifierRules: readonly PreparedQualifierRule[];
  qualifierTerms: ReadonlySet<string>;
  excludedTermsByConceptId: ReadonlyMap<string, readonly string[]>;
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

interface PreparedProductTerm {
  productConcept: ProductMatchConcept;
  term: string;
  source: "canonical-name" | "curated-term";
}

interface PreparedQualifierRule {
  qualifier: string;
  productTerms: readonly string[];
  productConcept: ProductMatchConcept;
}

interface TermCandidate {
  productConcept: ProductMatchConcept;
  matchedTerm: string;
  source: "canonical-name" | "curated-term" | "qualifier" | "typo-correction";
  confidence: number;
  qualifier?: string;
}

interface TypoCandidate extends TermCandidate {
  distance: number;
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

export function prepareProductMatchingCatalog(
  catalog: ProductMatchingCatalog,
): PreparedProductMatchingCatalog {
  const conceptsById = new Map(
    catalog.concepts.map((concept) => [concept.id, concept]),
  );
  const excludedTermsByConceptId = new Map(
    catalog.concepts.map((concept) => [
      concept.id,
      concept.excludedTerms.map(normalizeProductText).filter(Boolean),
    ]),
  );
  const termsByKey = new Map<string, PreparedProductTerm>();
  const addTerm = (
    productConcept: ProductMatchConcept,
    term: string,
    source: PreparedProductTerm["source"],
  ) => {
    const normalizedTerm = normalizeProductText(term);
    if (!normalizedTerm) {
      return;
    }

    const key = `${productConcept.id}:${normalizedTerm}`;
    const existing = termsByKey.get(key);
    if (!existing || source === "curated-term") {
      termsByKey.set(key, { productConcept, term: normalizedTerm, source });
    }
  };

  for (const concept of catalog.concepts) {
    addTerm(concept, concept.normalizedName, "canonical-name");
  }

  for (const curatedTerm of catalog.curatedTerms) {
    const productConcept = conceptsById.get(curatedTerm.productConceptId);
    if (productConcept) {
      addTerm(productConcept, curatedTerm.text, "curated-term");
    }
  }

  const qualifierRules = catalog.qualifierRules.flatMap((rule) => {
    const productConcept = conceptsById.get(rule.productConceptId);
    const qualifier = normalizeProductText(rule.qualifier);
    const productTerms = rule.productTerms
      .map(normalizeProductText)
      .filter(Boolean);

    if (!productConcept || !qualifier || productTerms.length === 0) {
      return [];
    }

    return [{ qualifier, productTerms, productConcept }];
  });
  const terms = [...termsByKey.values()];

  return {
    kind: "prepared-product-matching-catalog",
    conceptsById,
    terms,
    // Short terms have too many real-word neighbors to fuzzy-match safely.
    typoCandidateTerms: terms.filter((term) => term.term.length >= 6),
    qualifierRules,
    qualifierTerms: new Set(qualifierRules.map((rule) => rule.qualifier)),
    excludedTermsByConceptId,
  };
}

export function resolveProductMatch({
  text,
  catalog,
  learnedAlias,
}: {
  text: string;
  catalog: ProductMatchingCatalog | PreparedProductMatchingCatalog;
  learnedAlias?: LearnedProductAlias | null;
}): ProductMatchResult {
  const normalizedText = normalizeProductText(text);
  const preparedCatalog = isPreparedCatalog(catalog)
    ? catalog
    : prepareProductMatchingCatalog(catalog);

  if (!normalizedText) {
    return needsUserCorrection(
      text,
      normalizedText,
      "Enter a product name before choosing a route section.",
    );
  }

  if (
    learnedAlias &&
    learnedAlias.confidence > 0 &&
    learnedAlias.confidence <= 1 &&
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

  if (hasConflictingQualifiers(normalizedText, preparedCatalog)) {
    return needsUserCorrection(
      text,
      normalizedText,
      "The entered text includes conflicting department qualifiers.",
    );
  }

  const directMatch = [
    ...findTermCandidates(normalizedText, preparedCatalog),
    ...findQualifierCandidates(normalizedText, preparedCatalog),
  ].sort(compareCandidates)[0];

  if (directMatch) {
    return toMatchedResult(text, normalizedText, directMatch);
  }

  const typoMatch = findTypoCandidate(normalizedText, preparedCatalog);
  if (typoMatch) {
    return toMatchedResult(text, normalizedText, typoMatch);
  }

  return needsUserCorrection(
    text,
    normalizedText,
    "No product matched with sufficient confidence.",
  );
}

function findTermCandidates(
  normalizedText: string,
  catalog: PreparedProductMatchingCatalog,
) {
  const candidates: TermCandidate[] = [];

  for (const term of catalog.terms) {
    if (
      !containsPhrase(normalizedText, term.term) ||
      isExcluded(normalizedText, term.productConcept, catalog)
    ) {
      continue;
    }

    candidates.push({
      productConcept: term.productConcept,
      matchedTerm: term.term,
      source: term.source,
      confidence: term.source === "canonical-name" ? 0.95 : 0.97,
    });
  }

  return candidates;
}

function findQualifierCandidates(
  normalizedText: string,
  catalog: PreparedProductMatchingCatalog,
) {
  const candidates: TermCandidate[] = [];

  for (const rule of catalog.qualifierRules) {
    if (!containsPhrase(normalizedText, rule.qualifier)) {
      continue;
    }

    const matchedTerm = rule.productTerms
      .filter((term) => containsPhrase(normalizedText, term))
      .sort(compareTermsBySpecificity)[0];

    if (
      !matchedTerm ||
      isExcluded(normalizedText, rule.productConcept, catalog)
    ) {
      continue;
    }

    candidates.push({
      productConcept: rule.productConcept,
      matchedTerm,
      source: "qualifier",
      confidence: 0.99,
      qualifier: rule.qualifier,
    });
  }

  return candidates;
}

function findTypoCandidate(
  normalizedText: string,
  catalog: PreparedProductMatchingCatalog,
) {
  const inputPhrase = normalizedText
    .split(" ")
    .filter((word) => !catalog.qualifierTerms.has(word))
    .join(" ");

  if (!inputPhrase) {
    return undefined;
  }

  const candidates = catalog.typoCandidateTerms
    .map((term) => ({
      term,
      distance: levenshteinDistance(inputPhrase, term.term),
    }))
    .filter(({ term, distance }) => distance <= maximumTypoDistance(term.term))
    .filter(
      ({ term }) => !isExcluded(normalizedText, term.productConcept, catalog),
    )
    .map(
      ({ term, distance }): TypoCandidate => ({
        productConcept: term.productConcept,
        matchedTerm: term.term,
        source: "typo-correction",
        confidence: 0.91,
        distance,
      }),
    )
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        compareTermsBySpecificity(left.matchedTerm, right.matchedTerm) ||
        right.confidence - left.confidence,
    );

  const candidate = candidates[0];
  if (!candidate) {
    return undefined;
  }

  if (
    candidates.some(
      (other) =>
        other.productConcept.id !== candidate.productConcept.id &&
        other.distance === candidate.distance,
    )
  ) {
    return undefined;
  }

  const matchingRule = catalog.qualifierRules.find(
    (rule) =>
      containsPhrase(normalizedText, rule.qualifier) &&
      rule.productTerms.includes(candidate.matchedTerm),
  );

  if (
    !matchingRule ||
    isExcluded(normalizedText, matchingRule.productConcept, catalog)
  ) {
    return candidate;
  }

  return {
    ...candidate,
    productConcept: matchingRule.productConcept,
    qualifier: matchingRule.qualifier,
  };
}

function hasConflictingQualifiers(
  normalizedText: string,
  catalog: PreparedProductMatchingCatalog,
) {
  const qualifiers = new Set(
    catalog.qualifierRules
      .map((rule) => rule.qualifier)
      .filter((qualifier) => containsPhrase(normalizedText, qualifier)),
  );

  return qualifiers.size > 1;
}

function isExcluded(
  normalizedText: string,
  concept: ProductMatchConcept,
  catalog: PreparedProductMatchingCatalog,
) {
  return (catalog.excludedTermsByConceptId.get(concept.id) ?? []).some(
    (excludedTerm) => containsPhrase(normalizedText, excludedTerm),
  );
}

function isPreparedCatalog(
  catalog: ProductMatchingCatalog | PreparedProductMatchingCatalog,
): catalog is PreparedProductMatchingCatalog {
  return (
    "kind" in catalog && catalog.kind === "prepared-product-matching-catalog"
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
        : `Matched the ${candidate.source === "canonical-name" ? "canonical product name" : "curated term"} “${candidate.matchedTerm}”.`;

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
