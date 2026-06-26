import {
  ActiveShoppingListRequestError,
  getActiveShoppingListForLayout,
} from "@/services/active-shopping-list";
import { getStoreLayout } from "@/services/store-layout";

import { withDataTimeout } from "./data-timeout";

const PAGE_DATA_TIMEOUT_MS = 5_000;

export async function loadShoppingListPageData() {
  const layoutData = await loadStoreLayoutPageData("Shopping list");

  if (layoutData.dataError || !layoutData.layout) {
    return { ...layoutData, activeList: null };
  }

  try {
    const activeList = await withDataTimeout(
      getActiveShoppingListForLayout(layoutData.layout),
      PAGE_DATA_TIMEOUT_MS,
    );

    return { ...layoutData, activeList };
  } catch (error) {
    if (error instanceof ActiveShoppingListRequestError) {
      return { ...layoutData, activeList: null };
    }

    console.error("Shopping list data could not be loaded.", error);
    return { activeList: null, dataError: true, layout: null };
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
