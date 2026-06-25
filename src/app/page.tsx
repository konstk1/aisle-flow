import { requirePageSession } from "@/auth/access";
import { ActiveShoppingList } from "@/components/active-shopping-list";
import { AppMark } from "@/components/app-mark";
import { StoreLayoutEditor } from "@/components/store-layout-editor";
import Link from "next/link";
import {
  ActiveShoppingListRequestError,
  getActiveShoppingListForLayout,
} from "@/services/active-shopping-list";
import { getStoreLayout } from "@/services/store-layout";

const HOME_DATA_TIMEOUT_MS = 5_000;

export default async function Home() {
  await requirePageSession();
  const { activeList, dataError, layout } = await loadHomeData();

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

      {dataError ? (
        <HomeDataUnavailable />
      ) : (
        <>
          <ActiveShoppingList
            hasStoreLayout={layout !== null}
            initialActiveList={activeList}
          />
          <StoreLayoutEditor initialLayout={layout} />
        </>
      )}
    </main>
  );
}

async function loadHomeData() {
  try {
    const layout = await withTimeout(getStoreLayout(), HOME_DATA_TIMEOUT_MS);
    let activeList: Awaited<
      ReturnType<typeof getActiveShoppingListForLayout>
    > | null = null;

    if (layout) {
      try {
        activeList = await withTimeout(
          getActiveShoppingListForLayout(layout),
          HOME_DATA_TIMEOUT_MS,
        );
      } catch (error) {
        if (!(error instanceof ActiveShoppingListRequestError)) {
          throw error;
        }
      }
    }

    return { activeList, dataError: false, layout };
  } catch (error) {
    console.error("Home data could not be loaded.", error);
    return { activeList: null, dataError: true, layout: null };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Home data request timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function HomeDataUnavailable() {
  return (
    <section className="border-b py-12">
      <p className="text-sm font-medium text-zinc-500">Shopping list</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
        Store data is unavailable.
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
        The database did not respond after sign-in. Refresh in a moment; if it
        keeps happening, check the local database connection.
      </p>
      <Link
        className="mt-6 inline-flex min-h-11 items-center border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white"
        href="/"
      >
        Retry
      </Link>
    </section>
  );
}
