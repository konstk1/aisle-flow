import { loadCompletedShoppingListPageData } from "@/app/_lib/page-data";
import { getRouteSections } from "@/domain/store-layout";
import { CompletedShoppingList } from "@/components/active-shopping-list";
import { DataUnavailable } from "@/components/data-unavailable";

export default async function CompletedPage() {
  const { completedList, dataError, layout } =
    await loadCompletedShoppingListPageData();

  if (dataError) {
    return <DataUnavailable eyebrow="Completed items" retryHref="/completed" />;
  }

  return (
    <CompletedShoppingList
      hasStoreRoute={layout !== null && getRouteSections(layout).length > 0}
      initialCompletedList={completedList}
      key={layout?.id ?? "no-store"}
    />
  );
}
