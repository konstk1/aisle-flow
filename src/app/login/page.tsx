import { redirect } from "next/navigation";

import { getSafeRedirectPath } from "@/auth/redirect";
import { getServerSession } from "@/auth/access";
import { AppMark } from "@/components/app-mark";
import { PasswordForm } from "@/components/password-form";
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
      ? "That account is not on the guest list."
      : error
        ? "Unable to sign in with Google."
        : null;
  const nextPath = getSafeRedirectPath(next);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10 sm:px-8">
      <div className="card p-7 sm:p-9">
        <AppMark />

        <div className="mt-8">
          <p className="text-ink-500 text-[13px] font-bold tracking-[0.05em] uppercase">
            Private workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Sign in to Aisle Flow
          </h1>
          <p className="text-ink-400 mt-2 text-sm leading-6">
            Sign in with Google or your Aisle Flow password.
          </p>
        </div>

        <div className="mt-7 space-y-4">
          {message ? (
            <p
              aria-live="polite"
              className="bg-danger-50 text-danger rounded-xl px-4 py-3 text-sm font-medium"
              role="alert"
            >
              {message}
            </p>
          ) : null}

          <GoogleSignInButton nextPath={nextPath} />
          <details className="group">
            <summary className="text-accent focus-visible:outline-accent cursor-pointer list-none text-center text-sm font-bold underline underline-offset-4 group-open:hidden [&::-webkit-details-marker]:hidden">
              login w/ password
            </summary>
            <div className="mt-4 space-y-4">
              <PasswordForm mode="login" nextPath={nextPath} />
              <p className="text-ink-400 text-sm leading-6">
                Need to set or reset your password? Sign in with Google, then
                open Account.
              </p>
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
