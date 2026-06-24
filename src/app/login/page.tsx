import { AppMark } from "@/components/app-mark";
import { getSafeRedirectPath } from "@/auth/redirect";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;
  const message =
    error === "throttled"
      ? "Too many sign-in attempts. Try again shortly."
      : error === "invalid"
        ? "Unable to sign in. Check your password and try again."
        : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6 sm:px-8 sm:py-10">
      <header className="border-b pb-5">
        <AppMark />
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="text-sm font-medium text-zinc-500">Private workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Sign in to Aisle Flow
        </h1>
        <p className="mt-3 text-base leading-7 text-zinc-600">
          Enter the application password to continue.
        </p>

        <form action="/api/auth/login" className="mt-8 space-y-5" method="post">
          <input name="next" type="hidden" value={getSafeRedirectPath(next)} />
          <div>
            <label
              className="text-sm font-medium text-zinc-800"
              htmlFor="password"
            >
              Password
            </label>
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-zinc-950 shadow-sm transition outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>

          {message ? (
            <p aria-live="polite" className="text-sm text-red-700" role="alert">
              {message}
            </p>
          ) : null}

          <button
            className="w-full rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:outline-none"
            type="submit"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
