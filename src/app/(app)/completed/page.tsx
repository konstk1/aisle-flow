import { loadCompletedShoppingListPageData } from "@/app/_lib/page-data";
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
      hasStoreLayout={layout !== null}
      initialCompletedList={completedList}
    />
  );
}
