"use client";

import { useState } from "react";

import { authClient } from "@/auth/client";

export function GoogleSignInButton({ nextPath }: { nextPath: string }) {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className="w-full rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);

        try {
          await authClient.signIn.social({
            provider: "google",
            callbackURL: nextPath,
            errorCallbackURL: "/login?error=not-allowed",
          });
        } finally {
          setIsPending(false);
        }
      }}
      type="button"
    >
      {isPending ? "Opening Google..." : "Sign in with Google"}
    </button>
  );
}
