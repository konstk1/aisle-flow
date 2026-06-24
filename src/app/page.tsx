import { requirePageSession } from "@/auth/access";
import { AppMark } from "@/components/app-mark";
import { StoreLayoutEditor } from "@/components/store-layout-editor";
import { getStoreLayout } from "@/services/store-layout";

export default async function Home() {
  await requirePageSession();
  const layout = await getStoreLayout();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-6 sm:px-8 sm:py-10">
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

      <StoreLayoutEditor initialLayout={layout} />
    </main>
  );
}
