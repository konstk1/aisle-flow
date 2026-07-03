import { loadShoppingListPageData } from "@/app/_lib/page-data";
import { getRouteSections } from "@/domain/store-layout";
import { ActiveShoppingList } from "@/components/active-shopping-list";
import { DataUnavailable } from "@/components/data-unavailable";

export default async function Home() {
  const { activeList, dataError, layout } = await loadShoppingListPageData();

  if (dataError) {
    return <DataUnavailable eyebrow="Shopping list" retryHref="/" />;
  }

  return (
    <ActiveShoppingList
      hasStoreRoute={layout !== null && getRouteSections(layout).length > 0}
      initialActiveList={activeList}
      key={layout?.id ?? "no-store"}
    />
  );
}
