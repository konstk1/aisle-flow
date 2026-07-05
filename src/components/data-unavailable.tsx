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
      <div className="rounded-[20px] bg-white p-6 shadow-[0_2px_20px_rgba(20,23,40,0.06)] sm:p-8">
        <p className="text-[13px] font-bold tracking-[0.05em] text-[#8a8a92] uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Store data is unavailable.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9a9aa2]">
          The database did not respond after sign-in. Refresh in a moment; if it
          keeps happening, check the local database connection.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-gradient-to-br from-[#0a84ff] to-[#3b9dff] px-5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(10,132,255,0.32)] transition hover:brightness-105"
          href={retryHref}
        >
          Retry
        </Link>
      </div>
    </section>
  );
}
