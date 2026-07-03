"use client";

import { History, Pencil, Plus, RotateCw, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { FieldErrors } from "@/domain/active-shopping-list";
import type {
  LearnedProductPayload,
  LearnedProductsPayload,
} from "@/domain/learned-products";

import {
  ADD_PRODUCT_OPTION_VALUE,
  buildProductCorrectionRequest,
  buildProductSelectionPatch,
  createProductCorrectionFormState,
  type ProductCorrectionFormState,
} from "./active-shopping-list-state";
import { NewProductDialog } from "./new-product-dialog";

type ProductCorrectionOptions = {
  store: { id: string; name: string } | null;
  productConcepts: ProductCorrectionProductConcept[];
  aisleSections: ProductCorrectionAisleSection[];
};

type ProductCorrectionProductConcept = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  aisleSectionId: string | null;
};

type ProductCorrectionAisleSection = {
  id: string;
  aisleId: string;
  aisleIdentifier: string;
  aisleDisplayName: string | null;
  label: string | null;
  pathOrder: number;
  side: "left" | "right" | "center" | "endcap";
};

type ProductCorrectionOptionsResponse = {
  options?: ProductCorrectionOptions;
  error?: string;
};

type LearnedProductsResponse = {
  learnedProducts?: LearnedProductsPayload;
  error?: string;
  fieldErrors?: FieldErrors;
};

const eventDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const updatedDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

const EVENT_ACTION_LABELS = {
  created: "Learned",
  updated: "Changed",
  deleted: "Removed",
} as const;

export function LearnedProducts({
  initialLearnedProducts,
}: {
  initialLearnedProducts: LearnedProductsPayload;
}) {
  const [payload, setPayload] = useState(initialLearnedProducts);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [confirmingDeleteAliasId, setConfirmingDeleteAliasId] = useState<
    string | null
  >(null);
  const [form, setForm] = useState<ProductCorrectionFormState>(() =>
    createProductCorrectionFormState({
      productConceptId: null,
      hasProductConceptOptions: true,
    }),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAliasId, setPendingAliasId] = useState<string | null>(null);
  const [options, setOptions] = useState<ProductCorrectionOptions | null>(
    null,
  );
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  async function loadOptions() {
    setOptionsLoading(true);
    setOptionsError(null);

    try {
      const response = await fetch("/api/product-corrections");
      const result =
        (await response.json()) as ProductCorrectionOptionsResponse;

      if (!response.ok || !result.options) {
        setOptionsError(
          result.error ?? "Correction options could not be loaded.",
        );
        return;
      }

      setOptions(result.options);
    } catch {
      setOptionsError("Correction options could not be loaded.");
    } finally {
      setOptionsLoading(false);
    }
  }

  function toggleHistory(aliasId: string) {
    setExpandedHistoryIds((current) => {
      const next = new Set(current);

      if (next.has(aliasId)) {
        next.delete(aliasId);
      } else {
        next.add(aliasId);
      }

      return next;
    });
  }

  function startEditing(learning: LearnedProductPayload) {
    setEditingAliasId(learning.aliasId);
    setConfirmingDeleteAliasId(null);
    setFieldErrors({});
    setMessage(null);
    setForm({
      productSelection: learning.productConcept.id,
      canonicalName: "",
      aisleSectionId: learning.aisleSectionId ?? "",
    });

    if (!options && !optionsLoading) {
      void loadOptions();
    }
  }

  function stopEditing() {
    setEditingAliasId(null);
    setFieldErrors({});
    setMessage(null);
  }

  async function saveLearning(learning: LearnedProductPayload) {
    const request = buildProductCorrectionRequest({
      form,
      rawText: learning.normalizedText,
    });

    if (!request.success) {
      setFieldErrors(request.fieldErrors);
      return;
    }

    const body = {
      aisleSectionId: request.body.aisleSectionId,
      ...(request.body.productConceptId !== undefined
        ? { productConceptId: request.body.productConceptId }
        : { canonicalName: request.body.canonicalName }),
    };

    setPendingAliasId(learning.aliasId);
    setFieldErrors({});
    setMessage(null);

    try {
      const response = await fetch(
        `/api/product-corrections/${learning.aliasId}`,
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const result = (await response.json()) as LearnedProductsResponse;

      if (!response.ok || !result.learnedProducts) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error ?? "The learned product could not be saved.");
        return;
      }

      setPayload(result.learnedProducts);
      setEditingAliasId(null);
    } catch {
      setMessage("The learned product could not be saved.");
    } finally {
      setPendingAliasId(null);
    }
  }

  async function deleteLearning(learning: LearnedProductPayload) {
    setPendingAliasId(learning.aliasId);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/product-corrections/${learning.aliasId}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as LearnedProductsResponse;

      if (!response.ok || !result.learnedProducts) {
        setMessage(result.error ?? "The learned product could not be deleted.");
        return;
      }

      setPayload(result.learnedProducts);
    } catch {
      setMessage("The learned product could not be deleted.");
    } finally {
      setPendingAliasId(null);
      setConfirmingDeleteAliasId(null);
    }
  }

  return (
    <section className="py-8">
      <p className="text-sm font-medium text-zinc-500">Learned products</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
        {payload.store
          ? `Corrections learned for ${payload.store.name}.`
          : "No store layout yet."}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
        Item phrases the app has learned from your corrections, with the shelf
        product and aisle section each one resolves to.
      </p>

      {message && !editingAliasId ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}

      {payload.learnedProducts.length === 0 ? (
        <p className="mt-8 text-base text-zinc-600">
          No learned products yet. Correct an unresolved item on the shopping
          list to teach the app where it belongs.
        </p>
      ) : (
        <ul className="mt-8 divide-y border">
          {payload.learnedProducts.map((learning) => {
            const isEditing = editingAliasId === learning.aliasId;
            const isPending = pendingAliasId === learning.aliasId;
            const isConfirmingDelete =
              confirmingDeleteAliasId === learning.aliasId;
            const historyExpanded = expandedHistoryIds.has(learning.aliasId);

            return (
              <li className="p-4" key={learning.aliasId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-950">
                      {learning.normalizedText}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {learning.productConcept.canonicalName}
                      {learning.locationLabel
                        ? ` · ${learning.locationLabel}`
                        : " · no saved location"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Last updated{" "}
                      {updatedDateFormatter.format(
                        new Date(learning.updatedAt),
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      aria-expanded={historyExpanded}
                      aria-label={`Show history for ${learning.normalizedText}`}
                      className={`inline-flex size-9 items-center justify-center border hover:border-zinc-950 ${
                        historyExpanded
                          ? "border-zinc-950 text-zinc-950"
                          : "text-zinc-700"
                      }`}
                      onClick={() => toggleHistory(learning.aliasId)}
                      title="History"
                      type="button"
                    >
                      <History aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      aria-label={`Edit ${learning.normalizedText}`}
                      className="inline-flex size-9 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isPending}
                      onClick={() =>
                        isEditing ? stopEditing() : startEditing(learning)
                      }
                      title="Edit"
                      type="button"
                    >
                      {isEditing ? (
                        <X aria-hidden="true" className="size-4" />
                      ) : (
                        <Pencil aria-hidden="true" className="size-4" />
                      )}
                    </button>
                    {isConfirmingDelete ? (
                      <button
                        className="inline-flex min-h-9 items-center border border-red-700 bg-red-700 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void deleteLearning(learning)}
                        type="button"
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        aria-label={`Delete ${learning.normalizedText}`}
                        className="inline-flex size-9 items-center justify-center border text-zinc-700 hover:border-red-700 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() =>
                          setConfirmingDeleteAliasId(learning.aliasId)
                        }
                        title="Delete"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-2 border bg-zinc-50 p-3">
                    <LearnedProductEditor
                      fieldErrors={fieldErrors}
                      form={form}
                      learning={learning}
                      loadingOptions={optionsLoading}
                      onFormChange={(patch) =>
                        setForm((current) => ({ ...current, ...patch }))
                      }
                      onRetryOptions={() => void loadOptions()}
                      options={options}
                      optionsError={optionsError}
                      pending={isPending}
                    />
                    {message ? (
                      <p className="text-sm text-red-700" role="alert">
                        {message}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        className="inline-flex min-h-10 items-center border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending || optionsLoading || !options}
                        onClick={() => void saveLearning(learning)}
                        type="button"
                      >
                        {isPending ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="inline-flex min-h-10 items-center border px-4 text-sm font-medium text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={stopEditing}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {historyExpanded ? (
                  <div className="mt-4 border bg-zinc-50 p-3">
                    {learning.events.length === 0 ? (
                      <p className="text-sm text-zinc-600">
                        No history recorded for this learning. Changes made
                        from now on will show up here.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {learning.events.map((event) => (
                          <li className="text-sm text-zinc-700" key={event.id}>
                            <span className="font-medium text-zinc-950">
                              {EVENT_ACTION_LABELS[event.action]}
                            </span>{" "}
                            {event.action === "deleted"
                              ? `“${event.productConceptName}”`
                              : `as “${event.productConceptName}”${
                                  event.aisleSectionLabel
                                    ? ` in ${event.aisleSectionLabel}`
                                    : ""
                                }`}{" "}
                            by {event.createdByName ?? "an unknown user"} on{" "}
                            {eventDateFormatter.format(
                              new Date(event.createdAt),
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LearnedProductEditor({
  fieldErrors,
  form,
  learning,
  loadingOptions,
  onFormChange,
  onRetryOptions,
  options,
  optionsError,
  pending,
}: {
  fieldErrors: FieldErrors;
  form: ProductCorrectionFormState;
  learning: LearnedProductPayload;
  loadingOptions: boolean;
  onFormChange: (patch: Partial<ProductCorrectionFormState>) => void;
  onRetryOptions: () => void;
  options: ProductCorrectionOptions | null;
  optionsError: string | null;
  pending: boolean;
}) {
  const productConcepts = options?.productConcepts ?? [];
  const aisleSections = options?.aisleSections ?? [];
  const isAddingProduct = form.productSelection === ADD_PRODUCT_OPTION_VALUE;
  const selectedConceptIsMissing =
    form.productSelection.length > 0 &&
    !isAddingProduct &&
    !productConcepts.some((concept) => concept.id === form.productSelection);
  const formDisabled = pending || loadingOptions || !options || !!optionsError;
  const productControlId = `learned-product-${learning.aliasId}`;
  const [isNewProductDialogOpen, setIsNewProductDialogOpen] = useState(false);

  return (
    <div className="space-y-2">
      {loadingOptions ? (
        <p className="text-sm text-zinc-600" role="status">
          Loading location options.
        </p>
      ) : null}

      {optionsError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-red-700" role="alert">
            {optionsError}
          </p>
          <button
            aria-label="Retry loading location options"
            className="inline-flex size-9 items-center justify-center border text-zinc-700 hover:border-zinc-950"
            onClick={onRetryOptions}
            title="Retry"
            type="button"
          >
            <RotateCw aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}

      <FieldError messages={fieldErrors.form} />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="block min-w-0">
          <label className="sr-only" htmlFor={productControlId}>
            Product
          </label>
          <span className="flex">
            <select
              className="min-h-10 w-full min-w-0 flex-1 border bg-white px-3 text-sm outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={formDisabled}
              id={productControlId}
              onChange={(event) =>
                onFormChange(
                  buildProductSelectionPatch(
                    event.target.value,
                    productConcepts,
                  ),
                )
              }
              value={form.productSelection}
            >
              <option value="">Choose product</option>
              {isAddingProduct && form.canonicalName ? (
                <option value={ADD_PRODUCT_OPTION_VALUE}>
                  {form.canonicalName} (new)
                </option>
              ) : null}
              {selectedConceptIsMissing ? (
                <option value={learning.productConcept.id}>
                  {learning.productConcept.canonicalName}
                </option>
              ) : null}
              {productConcepts.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.canonicalName}
                </option>
              ))}
            </select>
            <button
              aria-label="New product"
              className="inline-flex size-10 shrink-0 items-center justify-center border border-l-0 text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={formDisabled}
              onClick={() => setIsNewProductDialogOpen(true)}
              title="New product"
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />
            </button>
          </span>
          <FieldError messages={fieldErrors.productConceptId} />
          <FieldError messages={fieldErrors.canonicalName} />
        </div>

        <label className="block min-w-0">
          <span className="sr-only">Route section</span>
          <select
            className="min-h-10 w-full border bg-white px-3 text-sm outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={formDisabled}
            onChange={(event) =>
              onFormChange({ aisleSectionId: event.target.value })
            }
            value={form.aisleSectionId}
          >
            <option value="">Choose section</option>
            {aisleSections.map((section) => (
              <option key={section.id} value={section.id}>
                {sectionOptionLabel(section)}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors.aisleSectionId} />
        </label>
      </div>

      <p className="text-xs leading-5 text-zinc-500">
        Products are shared across all stores; the route section
        applies only to {options?.store?.name ?? "this store"}.
      </p>

      {isNewProductDialogOpen ? (
        <NewProductDialog
          initialValues={{
            canonicalName: form.canonicalName,
            aisleSectionId: form.aisleSectionId,
          }}
          onCancel={() => setIsNewProductDialogOpen(false)}
          onSave={(values) => {
            onFormChange({
              productSelection: ADD_PRODUCT_OPTION_VALUE,
              canonicalName: values.canonicalName,
              aisleSectionId: values.aisleSectionId,
            });
            setIsNewProductDialogOpen(false);
          }}
          sections={aisleSections.map((section) => ({
            id: section.id,
            label: sectionOptionLabel(section),
          }))}
          storeName={options?.store?.name ?? null}
        />
      ) : null}
    </div>
  );
}

function sectionOptionLabel(section: ProductCorrectionAisleSection) {
  const aisleLabel =
    section.aisleDisplayName?.trim() || `Aisle ${section.aisleIdentifier}`;
  const sectionLabel = section.label?.trim() || `Section ${section.pathOrder + 1}`;

  return `${aisleLabel} · ${sectionLabel}`;
}

function FieldError({ messages }: { messages?: string[] | null }) {
  const allMessages = messages ?? [];

  if (allMessages.length === 0) {
    return null;
  }

  return (
    <>
      {allMessages.map((fieldMessage, index) => (
        <span
          className="mt-1 block text-sm font-normal text-red-700"
          key={`${fieldMessage}-${index}`}
        >
          {fieldMessage}
        </span>
      ))}
    </>
  );
}
