import type { ActiveShoppingListPayload } from "@/domain/active-shopping-list";
import type { LearnedProductsPayload } from "@/domain/learned-products";
import type { StoreLayout } from "@/domain/store-layout";
import { requirePageSession } from "@/auth/access";
import {
  getActiveShoppingListForStore,
  getCompletedShoppingListForStore,
  getSnoozedShoppingListForStore,
  type CurrentStoreInput,
} from "@/services/active-shopping-list";
import { getLearnedProducts } from "@/services/product-corrections";
import { getCurrentStoreLayout } from "@/services/store-layout";

import { withDataTimeout } from "./data-timeout";

const PAGE_DATA_TIMEOUT_MS = 5_000;

type ShoppingListPageDataKey = "activeList" | "completedList" | "snoozedList";

export async function loadShoppingListPageData() {
  return loadShoppingItemsPageData({
    loadList: getActiveShoppingListForStore,
    pageName: "Shopping list",
    resultKey: "activeList",
  });
}

export async function loadCompletedShoppingListPageData() {
  return loadShoppingItemsPageData({
    loadList: getCompletedShoppingListForStore,
    pageName: "Completed items",
    resultKey: "completedList",
  });
}

export async function loadSnoozedShoppingListPageData() {
  return loadShoppingItemsPageData({
    loadList: getSnoozedShoppingListForStore,
    pageName: "Snoozed items",
    resultKey: "snoozedList",
  });
}

async function loadShoppingItemsPageData<Key extends ShoppingListPageDataKey>({
  loadList,
  pageName,
  resultKey,
}: {
  loadList: (
    store: CurrentStoreInput,
    userId: string,
  ) => Promise<ActiveShoppingListPayload | null>;
  pageName: string;
  resultKey: Key;
}) {
  const userId = await requirePageSession();
  // The layout is only needed for page chrome; the list loader accepts the
  // pending store lookup, so both loads run concurrently.
  const layoutDataPromise = loadStoreLayoutData(userId, pageName);

  try {
    const list = await withDataTimeout(
      loadList(
        layoutDataPromise.then((data) => data.layout),
        userId,
      ),
      PAGE_DATA_TIMEOUT_MS,
    );
    const layoutData = await layoutDataPromise;

    if (layoutData.dataError) {
      return { ...layoutData, [resultKey]: null } as {
        dataError: boolean;
        layout: StoreLayout | null;
      } & Record<Key, ActiveShoppingListPayload | null>;
    }

    return { ...layoutData, [resultKey]: list } as {
      dataError: boolean;
      layout: StoreLayout | null;
    } & Record<Key, ActiveShoppingListPayload | null>;
  } catch (error) {
    console.error(`${pageName} data could not be loaded.`, error);
    return { [resultKey]: null, dataError: true, layout: null } as {
      dataError: boolean;
      layout: StoreLayout | null;
    } & Record<Key, ActiveShoppingListPayload | null>;
  }
}

export async function loadLearnedProductsPageData(): Promise<{
  dataError: boolean;
  learnedProducts: LearnedProductsPayload | null;
}> {
  const userId = await requirePageSession();

  try {
    const learnedProducts = await withDataTimeout(
      getLearnedProducts(userId),
      PAGE_DATA_TIMEOUT_MS,
    );

    return { dataError: false, learnedProducts };
  } catch (error) {
    console.error("Learned products data could not be loaded.", error);
    return { dataError: true, learnedProducts: null };
  }
}

export async function loadStoreLayoutPageData(pageName = "Store route") {
  const userId = await requirePageSession();

  return loadStoreLayoutData(userId, pageName);
}

async function loadStoreLayoutData(userId: string, pageName: string) {
  try {
    const layout = await withDataTimeout(
      getCurrentStoreLayout(userId),
      PAGE_DATA_TIMEOUT_MS,
    );

    return { dataError: false, layout };
  } catch (error) {
    console.error(`${pageName} data could not be loaded.`, error);
    return { dataError: true, layout: null };
  }
}
