"use client";

import { Copy, X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { StoreSummary } from "@/domain/stores";

import { useDialogFocusTrap } from "./use-dialog-focus-trap";

type StoreCopyResponse = {
  store?: StoreSummary;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function defaultCopyName(sourceName: string) {
  const suffix = " copy";
  return `${sourceName.slice(0, 80 - suffix.length)}${suffix}`;
}

export function CopyStoreDialog({
  onCancel,
  onCopied,
  sourceStoreId,
  sourceStoreName,
}: {
  onCancel: () => void;
  onCopied: (store: StoreSummary) => void;
  sourceStoreId: string;
  sourceStoreName: string;
}) {
  const [name, setName] = useState(() => defaultCopyName(sourceStoreName));
  const [error, setError] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useDialogFocusTrap({
    dialogRef,
    initialFocusRef: nameRef,
    onClose: isCopying ? () => undefined : onCancel,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsCopying(true);
    setError(null);

    try {
      const response = await fetch(`/api/stores/${sourceStoreId}/copy`, {
        body: JSON.stringify({ name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as StoreCopyResponse;

      if (!response.ok || !result.store) {
        setError(
          result.fieldErrors?.name?.[0] ??
            result.error ??
            "The store could not be copied.",
        );
        return;
      }

      onCopied(result.store);
    } catch {
      setError(
        "The store could not be copied. Check your connection and try again.",
      );
    } finally {
      setIsCopying(false);
    }
  }

  return createPortal(
    <div
      aria-labelledby="copy-store-title"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/30 px-4 py-5 sm:items-center"
      onClick={(event) => {
        event.stopPropagation();

        if (event.target === event.currentTarget && !isCopying) {
          onCancel();
        }
      }}
      role="dialog"
    >
      <form
        className="w-full max-w-md rounded-[18px] border border-black/[0.07] bg-white p-5 shadow-xl"
        onSubmit={submit}
        ref={dialogRef}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-lg font-bold tracking-tight"
              id="copy-store-title"
            >
              Copy to new store
            </h2>
            <p className="text-ink-400 mt-1 text-sm leading-6">
              Create a separate store using the saved route from{" "}
              {sourceStoreName}. Future changes will not affect the original.
            </p>
          </div>
          <button
            aria-label="Close copy store dialog"
            className="text-ink-350 hover:text-ink-900 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-50"
            disabled={isCopying}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <label className="text-ink-900 mt-5 block text-sm font-semibold">
          New store name
          <input
            className="focus:border-accent mt-2 min-h-11 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-sm transition outline-none"
            disabled={isCopying}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            ref={nameRef}
            value={name}
          />
        </label>
        <p className="text-ink-350 mt-2 text-xs leading-5">
          Only saved route changes are copied.
        </p>
        {error ? (
          <p className="text-danger mt-2 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="text-ink-500 hover:text-ink-900 min-h-10 px-3 text-sm font-semibold transition disabled:opacity-50"
            disabled={isCopying}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="from-accent to-accent-bright shadow-accent-glow inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-br px-4 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCopying}
            type="submit"
          >
            <Copy aria-hidden="true" className="size-4" />
            {isCopying ? "Copying…" : "Copy store"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
