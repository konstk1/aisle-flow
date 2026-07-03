"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";

import { useDialogFocusTrap } from "./use-dialog-focus-trap";

export function LocationChangeDialog({
  affectedItemTexts,
  onCancel,
  onProceed,
  productName,
  storeName,
}: {
  affectedItemTexts: readonly string[];
  onCancel: () => void;
  onProceed: () => void;
  productName: string;
  storeName: string | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({
    dialogRef,
    initialFocusRef: cancelRef,
    onClose: onCancel,
  });

  return createPortal(
    <div
      aria-labelledby="location-change-title"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/30 px-4 py-5 sm:items-center"
      onClick={(event) => {
        event.stopPropagation();

        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
      role="dialog"
    >
      <div
        className="w-full max-w-md rounded-md border bg-white p-5 shadow-xl"
        ref={dialogRef}
      >
        <h2
          className="text-base font-semibold text-zinc-950"
          id="location-change-title"
        >
          Change product location?
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          “{productName}” already has a location in{" "}
          {storeName ?? "this store"}. Saving moves every item linked to it in
          this store to the new section.
        </p>

        {affectedItemTexts.length > 0 ? (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium text-zinc-800">
              {affectedItemTexts.length} unfinished list{" "}
              {affectedItemTexts.length === 1 ? "item" : "items"} will move
            </summary>
            <ul className="mt-2 list-disc pl-5 leading-6 text-zinc-600">
              {affectedItemTexts.map((text, index) => (
                <li key={`${index}-${text}`}>{text}</li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="mt-4 text-sm text-zinc-600">
            No unfinished items on your list are affected.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="min-h-10 px-3 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
            onClick={onProceed}
            type="button"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
