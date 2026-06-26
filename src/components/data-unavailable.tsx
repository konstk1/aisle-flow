import Link from "next/link";

export function DataUnavailable({
  eyebrow,
  retryHref,
}: {
  eyebrow: string;
  retryHref: string;
}) {
  return (
    <section className="py-12">
      <p className="text-sm font-medium text-zinc-500">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
        Store data is unavailable.
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
        The database did not respond after sign-in. Refresh in a moment; if it
        keeps happening, check the local database connection.
      </p>
      <Link
        className="mt-6 inline-flex min-h-11 items-center border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white"
        href={retryHref}
      >
        Retry
      </Link>
    </section>
  );
}
