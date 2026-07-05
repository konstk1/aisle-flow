"use client";

import { Check, ChevronDown, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { StoreSummary } from "@/domain/stores";

export function StorePicker({
  stores,
  currentStoreId,
}: {
  stores: StoreSummary[];
  currentStoreId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const currentStore =
    stores.find((store) => store.id === currentStoreId) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  async function switchStore(storeId: string) {
    if (storeId === currentStoreId) {
      setIsOpen(false);
      return;
    }

    setPendingStoreId(storeId);
    setError(null);

    try {
      const response = await fetch("/api/current-store", {
        body: JSON.stringify({ storeId }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setError(result.error ?? "The store could not be switched.");
        return;
      }

      setIsOpen(false);
      router.refresh();
    } catch {
      setError("The store could not be switched.");
    } finally {
      setPendingStoreId(null);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={
          currentStore ? `Current store: ${currentStore.name}` : "Choose store"
        }
        className="inline-flex min-h-9 max-w-40 items-center gap-2 rounded-xl border border-black/[0.06] bg-white/70 px-3.5 py-1.5 text-sm font-semibold text-[#3a3a44] backdrop-blur-sm transition hover:bg-white sm:max-w-56"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Store aria-hidden="true" className="size-4 shrink-0 text-[#8a8a92]" />
        <span className="truncate">{currentStore?.name ?? "No store"}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-[#b0b0b8] transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div
          aria-label="Stores"
          className="absolute top-full right-0 z-10 mt-2 w-60 rounded-2xl border-0 bg-white p-1.5 shadow-[0_10px_34px_rgba(20,23,40,0.14)]"
          role="menu"
        >
          {stores.map((store) => {
            const isCurrent = store.id === currentStoreId;
            const isPending = pendingStoreId === store.id;

            return (
              <button
                aria-current={isCurrent ? "true" : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition hover:bg-[#f4f5f9] disabled:cursor-not-allowed disabled:opacity-60 ${
                  isCurrent ? "text-zinc-950" : "text-[#5a5a64]"
                }`}
                disabled={pendingStoreId !== null}
                key={store.id}
                onClick={() => void switchStore(store.id)}
                role="menuitem"
                type="button"
              >
                <span className="min-w-0 flex-1 truncate">
                  {isPending ? `Switching to ${store.name}…` : store.name}
                </span>
                {isCurrent ? (
                  <Check aria-hidden="true" className="size-4 text-[#0a84ff]" />
                ) : null}
              </button>
            );
          })}
          {stores.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-[#9a9aa2]">No stores yet.</p>
          ) : null}
          {error ? (
            <p className="px-3 py-1 text-sm text-[#ff453a]" role="alert">
              {error}
            </p>
          ) : null}
          <Link
            aria-current={pathname === "/stores" ? "page" : undefined}
            className="mt-1 flex min-h-11 items-center gap-3 rounded-xl border-t px-3 text-sm font-semibold text-[#5a5a64] transition hover:bg-[#f4f5f9]"
            href="/stores"
            onClick={() => setIsOpen(false)}
            role="menuitem"
          >
            <Store aria-hidden="true" className="size-4 text-[#a0a0a8]" />
            Manage stores
          </Link>
        </div>
      ) : null}
    </div>
  );
}
