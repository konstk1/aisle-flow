export interface StoreSummary {
  id: string;
  name: string;
}

export interface StoreListItem extends StoreSummary {
  isOwner: boolean;
}

export interface StoresPayload {
  stores: StoreSummary[];
  currentStoreId: string | null;
}
