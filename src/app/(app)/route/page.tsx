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
      <section className="pt-6 pb-12">
        <div className="rounded-[20px] bg-white p-6 shadow-[0_2px_20px_rgba(20,23,40,0.06)] sm:p-8">
          <p className="text-[13px] font-bold tracking-[0.05em] text-[#8a8a92] uppercase">
            Store route
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            No store yet.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9a9aa2]">
            Add a store first, then come back to build its route.
          </p>
          <Link
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-gradient-to-br from-[#0a84ff] to-[#3b9dff] px-5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(10,132,255,0.32)] transition hover:brightness-105"
            href="/stores"
          >
            Manage stores
          </Link>
        </div>
      </section>
    );
  }

  return <StoreLayoutEditor initialLayout={layout} key={layout.id} />;
}
