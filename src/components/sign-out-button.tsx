"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className="text-sm font-semibold text-ink-400 transition hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);

        try {
          await authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                router.push("/login");
                router.refresh();
              },
            },
          });
        } finally {
          setIsPending(false);
        }
      }}
      type="button"
    >
      Sign out
    </button>
  );
}
