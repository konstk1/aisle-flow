"use client";

import { History, Pencil, RotateCw, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { FieldErrors } from "@/domain/active-shopping-list";
import type {
  LearnedProductPayload,
  LearnedProductsPayload,
} from "@/domain/learned-products";

import {
  ADD_PRODUCT_OPTION_VALUE,
  NEW_PRODUCT_DIALOG_OPTION_VALUE,
  buildProductCorrectionRequest,
  buildProductSelectionPatch,
  createProductCorrectionFormState,
  getLocationChangeWarning,
  getProductSelectionState,
  type LocationChangeWarning,
  type ProductCorrectionFormState,
  type ProductCorrectionRequestBody,
} from "./active-shopping-list-state";
import { LocationChangeDialog } from "./location-change-dialog";
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
  const [locationChangeConfirm, setLocationChangeConfirm] = useState<{
    learning: LearnedProductPayload;
    body: ProductCorrectionRequestBody;
    warning: LocationChangeWarning;
  } | null>(null);

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
    setLocationChangeConfirm(null);
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

    const productConcepts = options?.productConcepts ?? [];
    const concept = productConcepts.find(
      (candidate) => candidate.id === request.body.productConceptId,
    );

    // Only relocating an existing product needs a confirmation; fetch the list
    // just then to show which of the user's items will move.
    if (
      concept?.aisleSectionId &&
      concept.aisleSectionId !== request.body.aisleSectionId
    ) {
      const warning = getLocationChangeWarning({
        body: request.body,
        productConcepts,
        items: await fetchActiveListItems(),
      });

      if (warning) {
        setLocationChangeConfirm({ learning, body: request.body, warning });
        return;
      }
    }

    await performSaveLearning(learning, request.body);
  }

  async function fetchActiveListItems() {
    try {
      const response = await fetch("/api/shopping-list");
      const result = (await response.json()) as {
        activeList?: {
          items?: {
            id: string;
            rawText: string;
            isChecked: boolean;
            productConcept: { id: string } | null;
          }[];
        } | null;
      };

      return response.ok ? (result.activeList?.items ?? []) : [];
    } catch {
      return [];
    }
  }

  async function performSaveLearning(
    learning: LearnedProductPayload,
    requestBody: ProductCorrectionRequestBody,
  ) {
    const body = {
      aisleSectionId: requestBody.aisleSectionId,
      ...(requestBody.productConceptId !== undefined
        ? { productConceptId: requestBody.productConceptId }
        : { canonicalName: requestBody.canonicalName }),
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
      // Refresh cached options so a product's location reflects this save on
      // the next edit rather than warning against the stale section.
      void loadOptions();
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
    <section className="pt-1 pb-12">
      <p className="text-[13px] font-bold tracking-[0.05em] text-ink-500 uppercase">
        Learned products
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
        {payload.store
          ? `Corrections learned for ${payload.store.name}.`
          : "No store layout yet."}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-400">
        Item phrases the app has learned from your corrections, with the
        product and aisle section each one resolves to.
      </p>

      {message && !editingAliasId ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {message}
        </p>
      ) : null}

      {payload.learnedProducts.length === 0 ? (
        <p className="mt-7 card p-6 text-sm text-ink-400">
          No learned products yet. Correct an unresolved item on the shopping
          list to teach the app where it belongs.
        </p>
      ) : (
        <ul className="mt-7 divide-y divide-divider-soft overflow-hidden card">
          {payload.learnedProducts.map((learning) => {
            const isEditing = editingAliasId === learning.aliasId;
            const isPending = pendingAliasId === learning.aliasId;
            const isConfirmingDelete =
              confirmingDeleteAliasId === learning.aliasId;
            const historyExpanded = expandedHistoryIds.has(learning.aliasId);

            return (
              <li className="p-4 sm:px-5" key={learning.aliasId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {learning.normalizedText}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      {learning.productConcept.canonicalName}
                      {learning.locationLabel
                        ? ` · ${learning.locationLabel}`
                        : " · no saved location"}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      Last updated{" "}
                      {updatedDateFormatter.format(
                        new Date(learning.updatedAt),
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      aria-expanded={historyExpanded}
                      aria-label={`Show history for ${learning.normalizedText}`}
                      className={`flex size-[34px] items-center justify-center rounded-[10px] transition ${
                        historyExpanded
                          ? "bg-accent-50 text-accent"
                          : "bg-ink-50 text-ink-500 hover:text-accent"
                      }`}
                      onClick={() => toggleHistory(learning.aliasId)}
                      title="History"
                      type="button"
                    >
                      <History aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      aria-label={`Edit ${learning.normalizedText}`}
                      className="flex size-[34px] items-center justify-center rounded-[10px] bg-ink-50 text-ink-500 transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="inline-flex min-h-[34px] items-center rounded-[10px] bg-danger px-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void deleteLearning(learning)}
                        type="button"
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        aria-label={`Delete ${learning.normalizedText}`}
                        className="flex size-[34px] items-center justify-center rounded-[10px] bg-danger-50 text-danger transition hover:bg-danger-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <div className="mt-4 space-y-2 rounded-[14px] bg-ink-50 p-3">
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
                      <p className="text-sm text-danger" role="alert">
                        {message}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        className="inline-flex min-h-10 items-center rounded-[14px] bg-gradient-to-br from-accent to-accent-bright px-4 text-sm font-semibold text-white shadow-accent-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending || optionsLoading || !options}
                        onClick={() => void saveLearning(learning)}
                        type="button"
                      >
                        {isPending ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="inline-flex min-h-10 items-center rounded-[14px] bg-white px-4 text-sm font-semibold text-ink-600 shadow-card-sm transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
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
                  <div className="mt-4 rounded-[14px] bg-ink-50 p-3">
                    {learning.events.length === 0 ? (
                      <p className="text-sm text-ink-400">
                        No history recorded for this learning. Changes made
                        from now on will show up here.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {learning.events.map((event) => (
                          <li
                            className="text-sm text-ink-600"
                            key={event.id}
                          >
                            <span className="font-semibold text-ink-900">
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

      {locationChangeConfirm ? (
        <LocationChangeDialog
          affectedItemTexts={locationChangeConfirm.warning.affectedItemTexts}
          onCancel={() => setLocationChangeConfirm(null)}
          onProceed={() => {
            const confirmed = locationChangeConfirm;
            setLocationChangeConfirm(null);
            void performSaveLearning(confirmed.learning, confirmed.body);
          }}
          productName={locationChangeConfirm.warning.productName}
          storeName={options?.store?.name ?? payload.store?.name ?? null}
        />
      ) : null}
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
  const { isAddingProduct, selectedConceptIsMissing, selectValue } =
    getProductSelectionState(form, productConcepts);
  const formDisabled = pending || loadingOptions || !options || !!optionsError;
  const productControlId = `learned-product-${learning.aliasId}`;
  const [isNewProductDialogOpen, setIsNewProductDialogOpen] = useState(false);

  return (
    <div className="space-y-2">
      {loadingOptions ? (
        <p className="text-sm text-ink-400" role="status">
          Loading location options.
        </p>
      ) : null}

      {optionsError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-danger" role="alert">
            {optionsError}
          </p>
          <button
            aria-label="Retry loading location options"
            className="flex size-9 items-center justify-center rounded-[10px] bg-white text-ink-500 shadow-card-sm transition hover:text-accent"
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
          <select
            className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3 text-sm outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            disabled={formDisabled}
            id={productControlId}
            onChange={(event) => {
              if (event.target.value === NEW_PRODUCT_DIALOG_OPTION_VALUE) {
                setIsNewProductDialogOpen(true);
                return;
              }

              onFormChange(
                buildProductSelectionPatch(
                  event.target.value,
                  productConcepts,
                ),
              );
            }}
            value={selectValue}
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
            <option value={NEW_PRODUCT_DIALOG_OPTION_VALUE}>
              Add product
            </option>
          </select>
          <FieldError messages={fieldErrors.productConceptId} />
          <FieldError messages={fieldErrors.canonicalName} />
        </div>

        <label className="block min-w-0">
          <span className="sr-only">Route section</span>
          <select
            className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3 text-sm outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
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

      <p className="text-xs leading-5 text-ink-400">
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
          className="mt-1 block text-sm font-medium text-danger"
          key={`${fieldMessage}-${index}`}
        >
          {fieldMessage}
        </span>
      ))}
    </>
  );
}
