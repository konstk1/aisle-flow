import { requirePageSession } from "@/auth/access";
import { AppShell } from "@/components/app-shell";
import { listStores, resolveCurrentStore } from "@/services/stores";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await requirePageSession();
  const [stores, currentStore] = await Promise.all([
    listStores(userId),
    resolveCurrentStore(userId),
  ]);

  return (
    <AppShell currentStoreId={currentStore?.id ?? null} stores={stores}>
      {children}
    </AppShell>
  );
}
