import type { ActiveShoppingListPayload } from "@/domain/active-shopping-list";
import type { StoreLayout } from "@/domain/store-layout";
import {
  ActiveShoppingListRequestError,
  getActiveShoppingListForLayout,
  getCompletedShoppingListForLayout,
  getSnoozedShoppingListForLayout,
} from "@/services/active-shopping-list";
import { getStoreLayout } from "@/services/store-layout";

import { withDataTimeout } from "./data-timeout";

const PAGE_DATA_TIMEOUT_MS = 5_000;

type ShoppingListPageDataKey = "activeList" | "completedList" | "snoozedList";

export async function loadShoppingListPageData() {
  return loadShoppingItemsPageData({
    loadList: getActiveShoppingListForLayout,
    pageName: "Shopping list",
    resultKey: "activeList",
  });
}

export async function loadCompletedShoppingListPageData() {
  return loadShoppingItemsPageData({
    loadList: getCompletedShoppingListForLayout,
    pageName: "Completed items",
    resultKey: "completedList",
  });
}

export async function loadSnoozedShoppingListPageData() {
  return loadShoppingItemsPageData({
    loadList: getSnoozedShoppingListForLayout,
    pageName: "Snoozed items",
    resultKey: "snoozedList",
  });
}

async function loadShoppingItemsPageData<Key extends ShoppingListPageDataKey>({
  loadList,
  pageName,
  resultKey,
}: {
  loadList: (layout: StoreLayout) => Promise<ActiveShoppingListPayload | null>;
  pageName: string;
  resultKey: Key;
}) {
  const layoutData = await loadStoreLayoutPageData(pageName);

  if (layoutData.dataError || !layoutData.layout) {
    return { ...layoutData, [resultKey]: null } as {
      dataError: boolean;
      layout: StoreLayout | null;
    } & Record<Key, ActiveShoppingListPayload | null>;
  }

  try {
    const list = await withDataTimeout(
      loadList(layoutData.layout),
      PAGE_DATA_TIMEOUT_MS,
    );

    return { ...layoutData, [resultKey]: list } as {
      dataError: boolean;
      layout: StoreLayout | null;
    } & Record<Key, ActiveShoppingListPayload | null>;
  } catch (error) {
    if (error instanceof ActiveShoppingListRequestError) {
      return { ...layoutData, [resultKey]: null } as {
        dataError: boolean;
        layout: StoreLayout | null;
      } & Record<Key, ActiveShoppingListPayload | null>;
    }

    console.error(`${pageName} data could not be loaded.`, error);
    return { [resultKey]: null, dataError: true, layout: null } as {
      dataError: boolean;
      layout: StoreLayout | null;
    } & Record<Key, ActiveShoppingListPayload | null>;
  }
}

export async function loadStoreLayoutPageData(pageName = "Store route") {
  try {
    const layout = await withDataTimeout(
      getStoreLayout(),
      PAGE_DATA_TIMEOUT_MS,
    );

    return { dataError: false, layout };
  } catch (error) {
    console.error(`${pageName} data could not be loaded.`, error);
    return { dataError: true, layout: null };
  }
}
