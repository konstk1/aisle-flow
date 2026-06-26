import { loadStoreLayoutPageData } from "@/app/_lib/page-data";
import { DataUnavailable } from "@/components/data-unavailable";
import { StoreLayoutEditor } from "@/components/store-layout-editor";

export default async function RoutePage() {
  const { dataError, layout } = await loadStoreLayoutPageData();

  if (dataError) {
    return <DataUnavailable eyebrow="Store route" retryHref="/route" />;
  }

  return <StoreLayoutEditor initialLayout={layout} />;
}
