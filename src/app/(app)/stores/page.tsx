import { requirePageSession } from "@/auth/access";
import { StoresManager } from "@/components/stores-manager";
import { listStores, resolveCurrentStore } from "@/services/stores";

export default async function StoresPage() {
  const userId = await requirePageSession();
  const [stores, currentStore] = await Promise.all([
    listStores(userId),
    resolveCurrentStore(userId),
  ]);

  return (
    <StoresManager currentStoreId={currentStore?.id ?? null} stores={stores} />
  );
}
