import { loadSnoozedShoppingListPageData } from "@/app/_lib/page-data";
import { getRouteSections } from "@/domain/store-layout";
import { SnoozedShoppingList } from "@/components/active-shopping-list";
import { DataUnavailable } from "@/components/data-unavailable";

export default async function SnoozedPage() {
  const { snoozedList, dataError, layout } =
    await loadSnoozedShoppingListPageData();

  if (dataError) {
    return <DataUnavailable eyebrow="Snoozed items" retryHref="/snoozed" />;
  }

  return (
    <SnoozedShoppingList
      hasStoreRoute={layout !== null && getRouteSections(layout).length > 0}
      initialSnoozedList={snoozedList}
      key={layout?.id ?? "no-store"}
    />
  );
}
