import Link from "next/link";

export function DataUnavailable({
  eyebrow,
  retryHref,
}: {
  eyebrow: string;
  retryHref: string;
}) {
  return (
    <section className="pt-6 pb-12">
      <div className="card p-6 sm:p-8">
        <p className="text-[13px] font-bold tracking-[0.05em] text-ink-500 uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Store data is unavailable.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-400">
          The database did not respond after sign-in. Refresh in a moment; if it
          keeps happening, check the local database connection.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-gradient-to-br from-accent to-accent-bright px-5 text-sm font-semibold text-white shadow-accent-glow transition hover:brightness-105"
          href={retryHref}
        >
          Retry
        </Link>
      </div>
    </section>
  );
}
