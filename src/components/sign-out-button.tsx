"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-70"
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
      <LogOut aria-hidden="true" className="size-4 text-ink-350" />
      <span className="min-w-0 flex-1 text-left">Sign out</span>
    </button>
  );
}
