export interface LearnedProductConceptPayload {
  id: string;
  canonicalName: string;
  normalizedName: string;
}

export interface LearnedProductPayload {
  aliasId: string;
  normalizedText: string;
  updatedAt: string;
  productConcept: LearnedProductConceptPayload;
  aisleSectionId: string | null;
  locationLabel: string | null;
}

export interface LearnedProductsPayload {
  store: { id: string; name: string } | null;
  learnedProducts: LearnedProductPayload[];
}
