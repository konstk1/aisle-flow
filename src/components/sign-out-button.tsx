"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { menuItemClass, menuItemIconClass } from "@/components/menu-item";

// Module-level so closing the nav menu (which unmounts this button and resets
// its local state) can't allow a duplicate sign-out while one is in flight.
let signOutInFlight = false;

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <button
      className={`${menuItemClass} w-full disabled:cursor-not-allowed disabled:opacity-60 ${
        hasError ? "text-danger" : "text-ink-700"
      }`}
      disabled={isPending}
      onClick={async () => {
        if (signOutInFlight) {
          return;
        }

        signOutInFlight = true;
        setIsPending(true);
        setHasError(false);

        try {
          await authClient.signOut({
            fetchOptions: {
              onError: () => setHasError(true),
              onSuccess: () => {
                router.push("/login");
                router.refresh();
              },
            },
          });
        } catch {
          setHasError(true);
        } finally {
          signOutInFlight = false;
          setIsPending(false);
        }
      }}
      type="button"
    >
      <LogOut aria-hidden="true" className={menuItemIconClass} />
      <span className="min-w-0 flex-1 text-left">
        {hasError ? "Sign out failed — try again" : "Sign out"}
      </span>
    </button>
  );
}
