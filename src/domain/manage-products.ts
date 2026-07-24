export interface ManagedProductAliasPayload {
  id: string;
  displayText: string;
  normalizedText: string;
  provenance: "standard" | "personal";
  source: "curated" | "learned" | "imported";
}

export interface ManagedProductLocationPayload {
  aisleSectionId: string;
  label: string;
}

export interface ManagedProductPayload {
  id: string;
  canonicalName: string;
  normalizedName: string;
  isSeeded: boolean;
  location: ManagedProductLocationPayload | null;
  aliases: ManagedProductAliasPayload[];
  affectedItemCount: number;
}

export interface ManageProductsAisleSectionPayload {
  id: string;
  label: string;
}

export interface ManageProductsPayload {
  store: { id: string; name: string } | null;
  aisleSections: ManageProductsAisleSectionPayload[];
  products: ManagedProductPayload[];
}
