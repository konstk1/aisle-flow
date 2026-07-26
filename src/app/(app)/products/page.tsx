import { loadManageProductsPageData } from "@/app/_lib/page-data";
import { DataUnavailable } from "@/components/data-unavailable";
import { ManageProducts } from "@/components/manage-products";

export default async function ManageProductsPage() {
  const { dataError, manageProducts } = await loadManageProductsPageData();

  if (dataError || !manageProducts) {
    return <DataUnavailable eyebrow="Manage products" retryHref="/products" />;
  }

  return (
    <ManageProducts
      initialPayload={manageProducts}
      key={manageProducts.store?.id ?? "no-store"}
    />
  );
}
