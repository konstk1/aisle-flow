export type LearnedProductAction = "created" | "updated" | "deleted";

export interface LearnedProductConceptPayload {
  id: string;
  canonicalName: string;
  normalizedName: string;
}

export interface LearnedProductEventPayload {
  id: string;
  action: LearnedProductAction;
  productConceptName: string;
  aisleSectionLabel: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface LearnedProductPayload {
  aliasId: string;
  normalizedText: string;
  updatedAt: string;
  productConcept: LearnedProductConceptPayload;
  aisleSectionId: string | null;
  locationLabel: string | null;
  events: LearnedProductEventPayload[];
}

export interface LearnedProductsPayload {
  store: { id: string; name: string } | null;
  learnedProducts: LearnedProductPayload[];
}
