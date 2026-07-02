export interface StoreSummary {
  id: string;
  name: string;
}

export interface StoresPayload {
  stores: StoreSummary[];
  currentStoreId: string | null;
}
