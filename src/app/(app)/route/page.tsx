import Link from "next/link";

import { loadStoreLayoutPageData } from "@/app/_lib/page-data";
import { DataUnavailable } from "@/components/data-unavailable";
import { StoreLayoutEditor } from "@/components/store-layout-editor";

export default async function RoutePage() {
  const { dataError, layout } = await loadStoreLayoutPageData();

  if (dataError) {
    return <DataUnavailable eyebrow="Store route" retryHref="/route" />;
  }

  if (!layout) {
    return (
      <section className="py-8">
        <p className="text-sm font-medium text-zinc-500">Store layout</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          No store yet.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
          Add a store first, then come back to build its route.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white"
          href="/stores"
        >
          Manage stores
        </Link>
      </section>
    );
  }

  return <StoreLayoutEditor initialLayout={layout} key={layout.id} />;
}
