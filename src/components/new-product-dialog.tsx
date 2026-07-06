"use client";

import { X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDialogFocusTrap } from "./use-dialog-focus-trap";

export type NewProductDialogSection = {
  id: string;
  label: string;
};

export type NewProductDialogValues = {
  canonicalName: string;
  aisleSectionId: string;
};

export function NewProductDialog({
  initialValues,
  onCancel,
  onSave,
  sections,
  storeName,
}: {
  initialValues: NewProductDialogValues;
  onCancel: () => void;
  onSave: (values: NewProductDialogValues) => void;
  sections: readonly NewProductDialogSection[];
  storeName: string | null;
}) {
  const [canonicalName, setCanonicalName] = useState(
    initialValues.canonicalName,
  );
  const [aisleSectionId, setAisleSectionId] = useState(
    initialValues.aisleSectionId,
  );
  const [fieldErrors, setFieldErrors] = useState<{
    canonicalName?: string;
    aisleSectionId?: string;
  }>({});
  const dialogRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useDialogFocusTrap({
    dialogRef,
    initialFocusRef: nameRef,
    onClose: onCancel,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The dialog is portaled out of any parent form in the DOM, but React
    // still bubbles the submit through the component tree.
    event.stopPropagation();

    const trimmedName = canonicalName.trim();
    const nextFieldErrors: typeof fieldErrors = {};

    if (!trimmedName) {
      nextFieldErrors.canonicalName = "Enter a product name.";
    }

    if (!aisleSectionId) {
      nextFieldErrors.aisleSectionId = "Choose a route section.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    onSave({ canonicalName: trimmedName, aisleSectionId });
  }

  return createPortal(
    <div
      aria-labelledby="new-product-title"
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
      <form
        className="w-full max-w-md rounded-md border bg-white p-5 shadow-xl"
        onSubmit={submit}
        ref={dialogRef}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-base font-semibold text-zinc-950"
              id="new-product-title"
            >
              New product
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Name the product and choose its route section in{" "}
              {storeName ?? "the current store"}.
            </p>
          </div>
          <button
            aria-label="Close new product dialog"
            className="inline-flex size-8 shrink-0 items-center justify-center text-zinc-500 transition hover:text-zinc-950 focus:ring-2 focus:ring-zinc-300 focus:outline-none"
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium text-zinc-800">
          Product name
          <input
            className="mt-2 min-h-10 w-full border bg-white px-3 text-sm text-zinc-950 transition outline-none focus:border-accent"
            onChange={(event) => setCanonicalName(event.target.value)}
            placeholder="New product"
            ref={nameRef}
            value={canonicalName}
          />
        </label>
        {fieldErrors.canonicalName ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {fieldErrors.canonicalName}
          </p>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-zinc-800">
          Route section
          <select
            className="mt-2 min-h-10 w-full border bg-white px-3 text-sm text-zinc-950 transition outline-none focus:border-accent"
            onChange={(event) => setAisleSectionId(event.target.value)}
            value={aisleSectionId}
          >
            <option value="">Choose section</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </label>
        {fieldErrors.aisleSectionId ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {fieldErrors.aisleSectionId}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="min-h-10 px-3 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
            type="submit"
          >
            Add product
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
