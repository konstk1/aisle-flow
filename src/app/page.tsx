import { requirePageSession } from "@/auth/access";
import { ActiveShoppingList } from "@/components/active-shopping-list";
import { AppMark } from "@/components/app-mark";
import { StoreLayoutEditor } from "@/components/store-layout-editor";
import {
  ActiveShoppingListRequestError,
  getActiveShoppingList,
} from "@/services/active-shopping-list";
import { getStoreLayout } from "@/services/store-layout";

export default async function Home() {
  await requirePageSession();
  const layout = await getStoreLayout();
  let activeList: Awaited<ReturnType<typeof getActiveShoppingList>> | null =
    null;

  if (layout) {
    try {
      activeList = await getActiveShoppingList();
    } catch (error) {
      if (!(error instanceof ActiveShoppingListRequestError)) {
        throw error;
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-10">
      <header className="flex items-center justify-between border-b pb-5">
        <AppMark />
        <form action="/api/auth/logout" method="post">
          <button
            className="text-sm text-zinc-500 underline-offset-4 hover:underline"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>

      <ActiveShoppingList
        hasStoreLayout={layout !== null}
        initialActiveList={activeList}
      />
      <StoreLayoutEditor initialLayout={layout} />
    </main>
  );
}
