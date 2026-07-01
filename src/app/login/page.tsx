import { AppMark } from "@/components/app-mark";
import { getSafeRedirectPath } from "@/auth/redirect";
import { getServerSession } from "@/auth/access";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { redirect } from "next/navigation";

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
          Use your allowlisted Google account to continue.
        </p>

        <div className="mt-8 space-y-5">
          {message ? (
            <p aria-live="polite" className="text-sm text-red-700" role="alert">
              {message}
            </p>
          ) : null}

          <GoogleSignInButton nextPath={nextPath} />
        </div>
      </section>
    </main>
  );
}
