import { ArrowRight, MapPin, Route } from "lucide-react";

import { requirePageSession } from "@/auth/access";
import { AppMark } from "@/components/app-mark";

export default async function Home() {
  await requirePageSession();

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

      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-4 text-sm font-medium text-zinc-500">
          Your store route
        </p>
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
          A shopping list that follows the aisle.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-600">
          Aisle Flow will place each item in the order you encounter it, so the
          list stays useful from the entrance to checkout.
        </p>

        <div className="mt-12 divide-y border-y">
          <div className="flex gap-4 py-5">
            <Route aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="font-medium">Configured route</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Ordered aisle sections will define a predictable path through
                each store.
              </p>
            </div>
          </div>
          <div className="flex gap-4 py-5">
            <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="font-medium">Learned locations</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Corrections will improve future lists without changing the item
                you entered.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
          The application foundation is ready for the first shopping workflow.
          <ArrowRight aria-hidden="true" className="size-4" />
        </p>
      </section>
    </main>
  );
}
