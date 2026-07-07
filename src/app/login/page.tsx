import { redirect } from "next/navigation";

import { getSafeRedirectPath } from "@/auth/redirect";
import { getServerSession } from "@/auth/access";
import { AppMark } from "@/components/app-mark";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getServerSession()) {
    redirect("/");
  }

  const { error, next } = await searchParams;
  const message =
    error === "not-allowed" || error === "EMAIL_NOT_ALLOWED"
      ? "That Google account is not on the guest list."
      : error
        ? "Unable to sign in with Google."
        : null;
  const nextPath = getSafeRedirectPath(next);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10 sm:px-8">
      <div className="card p-7 sm:p-9">
        <AppMark />

        <div className="mt-8">
          <p className="text-[13px] font-bold tracking-[0.05em] text-ink-500 uppercase">
            Private workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Sign in to Aisle Flow
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-400">
            Use your allowlisted Google account to continue.
          </p>
        </div>

        <div className="mt-7 space-y-4">
          {message ? (
            <p
              aria-live="polite"
              className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger"
              role="alert"
            >
              {message}
            </p>
          ) : null}

          <GoogleSignInButton nextPath={nextPath} />
        </div>
      </div>
    </main>
  );
}
