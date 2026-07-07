"use client";

import { Pencil, RotateCw, Trash2, X } from "lucide-react";
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

const updatedDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function LearnedProducts({
  initialLearnedProducts,
}: {
  initialLearnedProducts: LearnedProductsPayload;
}) {
  const [payload, setPayload] = useState(initialLearnedProducts);
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
  const [options, setOptions] = useState<ProductCorrectionOptions | null>(null);
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
      <p className="text-ink-500 text-[13px] font-bold tracking-[0.05em] uppercase">
        Learned products
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
        Your learned corrections.
      </h1>
      <p className="text-ink-400 mt-3 max-w-2xl text-sm leading-6">
        Item phrases the app has learned from your corrections, with the product
        each one resolves to. Corrections follow you across stores;
        {payload.store
          ? ` the aisle sections shown are for ${payload.store.name}.`
          : " aisle sections appear once you have a store layout."}
      </p>

      {message && !editingAliasId ? (
        <p className="text-danger mt-4 text-sm" role="alert">
          {message}
        </p>
      ) : null}

      {payload.learnedProducts.length === 0 ? (
        <p className="card text-ink-400 mt-7 p-6 text-sm">
          No learned products yet. Correct an unresolved item on the shopping
          list to teach the app where it belongs.
        </p>
      ) : (
        <ul className="divide-divider-soft card mt-7 divide-y overflow-hidden">
          {payload.learnedProducts.map((learning) => {
            const isEditing = editingAliasId === learning.aliasId;
            const isPending = pendingAliasId === learning.aliasId;
            const isConfirmingDelete =
              confirmingDeleteAliasId === learning.aliasId;

            return (
              <li className="p-4 sm:px-5" key={learning.aliasId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground font-semibold">
                      {learning.normalizedText}
                    </p>
                    <p className="text-ink-600 mt-1 text-sm">
                      {learning.productConcept.canonicalName}
                      {learning.locationLabel
                        ? ` · ${learning.locationLabel}`
                        : " · no saved location"}
                    </p>
                    <p className="text-ink-400 mt-1 text-xs">
                      Last updated{" "}
                      {updatedDateFormatter.format(
                        new Date(learning.updatedAt),
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      aria-label={`Edit ${learning.normalizedText}`}
                      className="bg-ink-50 text-ink-500 hover:text-accent flex size-[34px] items-center justify-center rounded-[10px] transition disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="bg-danger inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void deleteLearning(learning)}
                        type="button"
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        aria-label={`Delete ${learning.normalizedText}`}
                        className="bg-danger-50 text-danger hover:bg-danger-100 flex size-[34px] items-center justify-center rounded-[10px] transition disabled:cursor-not-allowed disabled:opacity-50"
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
                  <div className="bg-ink-50 mt-4 space-y-2 rounded-[14px] p-3">
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
                      <p className="text-danger text-sm" role="alert">
                        {message}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        className="from-accent to-accent-bright shadow-accent-glow inline-flex min-h-10 items-center rounded-[14px] bg-gradient-to-br px-4 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending || optionsLoading || !options}
                        onClick={() => void saveLearning(learning)}
                        type="button"
                      >
                        {isPending ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="text-ink-600 shadow-card-sm hover:text-accent inline-flex min-h-10 items-center rounded-[14px] bg-white px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={stopEditing}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
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
        <p className="text-ink-400 text-sm" role="status">
          Loading location options.
        </p>
      ) : null}

      {optionsError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-danger text-sm" role="alert">
            {optionsError}
          </p>
          <button
            aria-label="Retry loading location options"
            className="text-ink-500 shadow-card-sm hover:text-accent flex size-9 items-center justify-center rounded-[10px] bg-white transition"
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
            className="focus:border-accent min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3 text-sm transition outline-none disabled:cursor-not-allowed disabled:opacity-60"
            disabled={formDisabled}
            id={productControlId}
            onChange={(event) => {
              if (event.target.value === NEW_PRODUCT_DIALOG_OPTION_VALUE) {
                setIsNewProductDialogOpen(true);
                return;
              }

              onFormChange(
                buildProductSelectionPatch(event.target.value, productConcepts),
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
            <option value={NEW_PRODUCT_DIALOG_OPTION_VALUE}>Add product</option>
          </select>
          <FieldError messages={fieldErrors.productConceptId} />
          <FieldError messages={fieldErrors.canonicalName} />
        </div>

        <label className="block min-w-0">
          <span className="sr-only">Route section</span>
          <select
            className="focus:border-accent min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3 text-sm transition outline-none disabled:cursor-not-allowed disabled:opacity-60"
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

      <p className="text-ink-400 text-xs leading-5">
        Products are shared across all stores; the route section applies only to{" "}
        {options?.store?.name ?? "this store"}.
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
  const sectionLabel =
    section.label?.trim() || `Section ${section.pathOrder + 1}`;

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
          className="text-danger mt-1 block text-sm font-medium"
          key={`${fieldMessage}-${index}`}
        >
          {fieldMessage}
        </span>
      ))}
    </>
  );
}
