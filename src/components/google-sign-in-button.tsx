"use client";

import { Roboto } from "next/font/google";
import { useState } from "react";

import { authClient } from "@/auth/client";

// Google's branding guidelines call for "Google Sans Medium"; Product/Google
// Sans isn't distributable, so Roboto Medium is Google's documented fallback
// and what their own assets shipped with for years. Scoped to this button only.
const googleFont = Roboto({
  weight: "500",
  subsets: ["latin"],
  display: "swap",
});

// The standard full-color "super G" mark, unmodified per Google's guidelines
// (exact colors, on the button's white background).
function GoogleG() {
  return (
    <svg
      aria-hidden="true"
      className="size-[18px] shrink-0"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M47.532 24.552c0-1.626-.147-3.19-.42-4.69H24.48v8.87h12.926c-.557 3-2.25 5.542-4.792 7.243v6.02h7.754c4.537-4.178 7.164-10.332 7.164-17.443z"
        fill="#4285F4"
      />
      <path
        d="M24.48 48c6.48 0 11.916-2.147 15.888-5.815l-7.754-6.02c-2.148 1.44-4.896 2.29-8.134 2.29-6.253 0-11.545-4.222-13.433-9.9H3.03v6.216C6.98 42.62 14.986 48 24.48 48z"
        fill="#34A853"
      />
      <path
        d="M11.047 28.555c-.48-1.44-.753-2.977-.753-4.555s.273-3.115.753-4.555V13.23H3.03A23.96 23.96 0 0 0 .48 24c0 3.873.927 7.537 2.55 10.77l8.017-6.215z"
        fill="#FBBC05"
      />
      <path
        d="M24.48 9.545c3.533 0 6.703 1.215 9.197 3.6l6.9-6.9C36.39 2.39 30.954 0 24.48 0 14.986 0 6.98 5.38 3.03 13.23l8.017 6.215c1.888-5.678 7.18-9.9 13.433-9.9z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInButton({ nextPath }: { nextPath: string }) {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className={`${googleFont.className} inline-flex h-11 w-full items-center justify-center gap-[10px] rounded-full border border-[#747775] bg-white pr-3 pl-3 text-sm text-[#1f1f1f] transition hover:bg-[#f8faff] hover:shadow-card-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70`}
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
      <GoogleG />
      <span>{isPending ? "Opening Google…" : "Sign in with Google"}</span>
    </button>
  );
}
