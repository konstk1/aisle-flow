"use client";

import {
  AlertTriangle,
  Check,
  MapPin,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import type {
  ActiveShoppingItemPayload,
  ActiveShoppingListPayload,
  FieldErrors,
} from "@/domain/active-shopping-list";

import {
  ADD_CATEGORY_OPTION_VALUE,
  buildProductCorrectionRequest,
  createProductCorrectionFormState,
  getStableMutationForText,
  mergeActiveListSnapshotAfterCheck,
  replaceItemInActiveList,
  type PendingTextMutation,
  type ProductCorrectionFormState,
} from "./active-shopping-list-state";

type ActiveShoppingListProps = {
  initialActiveList: ActiveShoppingListPayload | null;
  hasStoreLayout: boolean;
};

type ActiveListResponse = {
  activeList?: ActiveShoppingListPayload;
  error?: string;
  fieldErrors?: FieldErrors;
};

type ProductCorrectionOptionsResponse = {
  options?: ProductCorrectionOptions;
  error?: string;
};

type ProductCorrectionResponse = {
  correction?: { normalizedText: string };
  error?: string;
  fieldErrors?: FieldErrors;
};

type ProductCorrectionOptions = {
  store: { id: string; name: string } | null;
  productConcepts: ProductCorrectionProductConcept[];
  aisleSections: ProductCorrectionAisleSection[];
};

type ProductCorrectionProductConcept = {
  id: string;
  canonicalName: string;
  normalizedName: string;
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

type FieldErrorScope = "add" | "import";

export function ActiveShoppingList({
  hasStoreLayout,
  initialActiveList,
}: ActiveShoppingListProps) {
  const [activeList, setActiveList] = useState(initialActiveList);
  const [itemText, setItemText] = useState("");
  const [importText, setImportText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [fieldErrorScope, setFieldErrorScope] =
    useState<FieldErrorScope | null>(null);
  const [message, setMessage] = useState<string | null>(
    hasStoreLayout ? null : "Save a store route before adding items.",
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingCheckItemIds, setPendingCheckItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [correctionOptions, setCorrectionOptions] =
    useState<ProductCorrectionOptions | null>(null);
  const [correctionOptionsLoading, setCorrectionOptionsLoading] =
    useState(false);
  const [correctionOptionsError, setCorrectionOptionsError] = useState<
    string | null
  >(null);
  const [correctionForm, setCorrectionForm] =
    useState<ProductCorrectionFormState>(() =>
      createProductCorrectionFormState({
        productConceptId: null,
        hasProductConceptOptions: true,
      }),
    );
  const [correctionFieldErrors, setCorrectionFieldErrors] =
    useState<FieldErrors>({});
  const [correctionMessage, setCorrectionMessage] = useState<string | null>(
    null,
  );
  const [pendingCorrectionItemId, setPendingCorrectionItemId] = useState<
    string | null
  >(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState<FieldErrors>({});
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [pendingEditItemId, setPendingEditItemId] = useState<string | null>(
    null,
  );
  const [editLocationTouched, setEditLocationTouched] = useState(false);
  const [pendingDeleteItemIds, setPendingDeleteItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const pendingAddMutation = useRef<PendingTextMutation | null>(null);
  const pendingImportMutation = useRef<PendingTextMutation | null>(null);
  const pendingCheckItemIdsRef = useRef<Set<string>>(new Set());
  const items = activeList?.items ?? [];
  const editItem = items.find((item) => item.id === editItemId) ?? null;
  const editHasChanges = editItem
    ? editText !== editItem.rawText || editLocationTouched
    : false;

  async function applyListResponse(
    response: Response,
    fieldScope: FieldErrorScope | null = null,
  ) {
    const result = (await response.json()) as ActiveListResponse;

    if (!response.ok || !result.activeList) {
      setFieldErrors(result.fieldErrors ?? {});
      setFieldErrorScope(fieldScope);
      setMessage(result.error ?? "The shopping list could not be updated.");
      return false;
    }

    setActiveList(result.activeList);
    setFieldErrors({});
    setFieldErrorScope(null);
    setMessage(null);
    return true;
  }

  async function applyCheckedListResponse(
    response: Response,
    completedCheckItemId: string,
  ) {
    const result = (await response.json()) as ActiveListResponse;

    if (!response.ok || !result.activeList) {
      setFieldErrors(result.fieldErrors ?? {});
      setFieldErrorScope(null);
      setMessage(result.error ?? "The shopping list could not be updated.");
      return false;
    }

    const nextList = result.activeList;
    setActiveList((currentList) =>
      mergeActiveListSnapshotAfterCheck({
        completedCheckItemId,
        currentList,
        nextList,
        pendingCheckItemIds: pendingCheckItemIdsRef.current,
      }),
    );
    setFieldErrors({});
    setFieldErrorScope(null);
    setMessage(null);
    return true;
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("add");
    const mutation = getStableMutationForText(
      pendingAddMutation.current,
      itemText,
      () => crypto.randomUUID(),
    );
    pendingAddMutation.current = mutation;

    try {
      const response = await fetch("/api/shopping-list", {
        body: JSON.stringify({
          text: itemText,
          mutationId: mutation.mutationId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (await applyListResponse(response, "add")) {
        setItemText("");
        pendingAddMutation.current = null;
      }
    } catch {
      setMessage("The item could not be added. Check your connection.");
    } finally {
      setPendingAction(null);
    }
  }

  async function importItems(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("import");
    const mutation = getStableMutationForText(
      pendingImportMutation.current,
      importText,
      () => crypto.randomUUID(),
    );
    pendingImportMutation.current = mutation;

    try {
      const response = await fetch("/api/shopping-list/import", {
        body: JSON.stringify({
          text: importText,
          mutationId: mutation.mutationId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (await applyListResponse(response, "import")) {
        setImportText("");
        pendingImportMutation.current = null;
      }
    } catch {
      setMessage("The items could not be imported. Check your connection.");
    } finally {
      setPendingAction(null);
    }
  }

  async function setChecked(itemId: string, isChecked: boolean) {
    const previousItem = activeList?.items.find((item) => item.id === itemId);

    setMessage(null);
    setActiveList((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    isChecked,
                    checkedAt: isChecked ? new Date().toISOString() : null,
                  }
                : item,
            ),
          }
        : current,
    );
    setItemCheckPending(itemId, true);

    try {
      const response = await fetch(`/api/shopping-list/items/${itemId}`, {
        body: JSON.stringify({ isChecked }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!(await applyCheckedListResponse(response, itemId)) && previousItem) {
        restoreItem(previousItem);
      }
    } catch {
      if (previousItem) {
        restoreItem(previousItem);
      }
      setMessage("The item could not be updated. Check your connection.");
    } finally {
      setItemCheckPending(itemId, false);
    }
  }

  function restoreItem(previousItem: ActiveShoppingItemPayload) {
    setActiveList((currentList) =>
      replaceItemInActiveList(currentList, previousItem),
    );
  }

  function setItemCheckPending(itemId: string, isPending: boolean) {
    const next = new Set(pendingCheckItemIdsRef.current);

    if (isPending) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }

    pendingCheckItemIdsRef.current = next;
    setPendingCheckItemIds(next);
  }

  function openEdit(item: ActiveShoppingItemPayload) {
    setEditItemId(item.id);
    setEditText(item.rawText);
    setEditFieldErrors({});
    setEditMessage(null);
    setEditLocationTouched(false);
    setCorrectionFieldErrors({});
    setCorrectionMessage(null);
    setCorrectionForm({
      ...createProductCorrectionFormState({
        productConceptId: item.productConcept?.id ?? null,
        hasProductConceptOptions: correctionOptions
          ? correctionOptions.productConcepts.length > 0
          : true,
      }),
      aisleSectionId: item.location?.aisleSectionId ?? "",
    });

    if (!correctionOptions && !correctionOptionsLoading) {
      void loadCorrectionOptions();
    }
  }

  function closeEdit() {
    setEditItemId(null);
    setEditText("");
    setEditFieldErrors({});
    setEditMessage(null);
    setEditLocationTouched(false);
    setCorrectionFieldErrors({});
    setCorrectionMessage(null);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editItem) {
      return;
    }

    setPendingEditItemId(editItem.id);
    setEditFieldErrors({});
    setEditMessage(null);
    setCorrectionFieldErrors({});
    setCorrectionMessage(null);

    const shouldSaveLocation =
      editLocationTouched ||
      (editItem.location !== null &&
        editText.trim() !== editItem.rawText.trim());
    const correctionRequest = shouldSaveLocation
      ? buildProductCorrectionRequest({
          form: correctionForm,
          rawText: editText,
        })
      : null;

    if (correctionRequest?.success === false) {
      setCorrectionFieldErrors(correctionRequest.fieldErrors);
      setCorrectionMessage("Check the highlighted location fields.");
      setPendingEditItemId(null);
      return;
    }

    if (correctionRequest?.success) {
      setPendingCorrectionItemId(editItem.id);
    }

    try {
      const response = await fetch(`/api/shopping-list/items/${editItem.id}`, {
        body: JSON.stringify({ text: editText }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json()) as ActiveListResponse;

      if (!response.ok || !result.activeList) {
        setEditFieldErrors(result.fieldErrors ?? {});
        setEditMessage(result.error ?? "The item could not be updated.");
        return;
      }

      setActiveList(result.activeList);

      if (correctionRequest?.success) {
        const correctionResponse = await fetch("/api/product-corrections", {
          body: JSON.stringify(correctionRequest.body),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const correctionResult =
          (await correctionResponse.json()) as ProductCorrectionResponse;

        if (!correctionResponse.ok || !correctionResult.correction) {
          setCorrectionFieldErrors(correctionResult.fieldErrors ?? {});
          setCorrectionMessage(
            correctionResult.error ?? "The location could not be saved.",
          );
          return;
        }

        const listResponse = await fetch("/api/shopping-list");
        const listResult = (await listResponse.json()) as ActiveListResponse;

        if (!listResponse.ok || !listResult.activeList) {
          setCorrectionMessage(
            listResult.error ??
              "Location saved, but the list could not refresh.",
          );
          return;
        }

        setActiveList(listResult.activeList);
      }

      closeEdit();
      setFieldErrors({});
      setFieldErrorScope(null);
      setMessage(null);
    } catch {
      setEditMessage("The item could not be updated. Check your connection.");
    } finally {
      setPendingEditItemId(null);
      setPendingCorrectionItemId(null);
    }
  }

  async function deleteItem(item: ActiveShoppingItemPayload) {
    setMessage(null);
    setItemDeletePending(item.id, true);

    if (editItemId === item.id) {
      closeEdit();
    }

    try {
      const response = await fetch(`/api/shopping-list/items/${item.id}`, {
        method: "DELETE",
      });
      await applyListResponse(response);
    } catch {
      setMessage("The item could not be deleted. Check your connection.");
    } finally {
      setItemDeletePending(item.id, false);
    }
  }

  function setItemDeletePending(itemId: string, isPending: boolean) {
    setPendingDeleteItemIds((current) => {
      const next = new Set(current);

      if (isPending) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }

      return next;
    });
  }

  async function loadCorrectionOptions() {
    setCorrectionOptionsLoading(true);
    setCorrectionOptionsError(null);

    try {
      const response = await fetch("/api/product-corrections");
      const result =
        (await response.json()) as ProductCorrectionOptionsResponse;

      if (!response.ok || !result.options) {
        throw new Error(
          result.error ?? "Correction options could not be loaded.",
        );
      }

      const options = result.options;

      setCorrectionOptions(options);
      setCorrectionForm((current) =>
        current.categorySelection.length === 0 &&
        options.productConcepts.length === 0
          ? { ...current, categorySelection: ADD_CATEGORY_OPTION_VALUE }
          : current,
      );
      return options;
    } catch (error) {
      setCorrectionOptionsError(
        error instanceof Error
          ? error.message
          : "Correction options could not be loaded.",
      );
      return null;
    } finally {
      setCorrectionOptionsLoading(false);
    }
  }

  function updateCorrectionForm(patch: Partial<ProductCorrectionFormState>) {
    setCorrectionForm((current) => ({ ...current, ...patch }));
    setEditLocationTouched(true);
    setCorrectionFieldErrors({});
    setCorrectionMessage(null);
  }

  async function refreshList() {
    setPendingAction("refresh");

    try {
      const response = await fetch("/api/shopping-list");
      await applyListResponse(response);
    } catch {
      setMessage("The shopping list could not be loaded.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="border-b pt-10 pb-12 sm:pt-14">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">Shopping list</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Active list.
          </h1>
        </div>
        <button
          aria-label="Refresh shopping list"
          className="inline-flex size-11 shrink-0 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pendingAction !== null}
          onClick={refreshList}
          type="button"
        >
          <RotateCw aria-hidden="true" className="size-4" />
        </button>
      </div>

      <form className="mt-8 flex gap-2" onSubmit={addItem}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Item text</span>
          <input
            className="min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasStoreLayout || pendingAction !== null}
            onChange={(event) => setItemText(event.target.value)}
            placeholder="Milk"
            value={itemText}
          />
          <FieldError
            message={fieldErrorScope === "add" ? fieldErrors.text?.[0] : null}
          />
        </label>
        <button
          className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasStoreLayout || pendingAction !== null}
          type="submit"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add
        </button>
      </form>

      <form className="mt-5" onSubmit={importItems}>
        <label className="block text-sm font-medium text-zinc-800">
          Paste items
          <textarea
            className="mt-2 min-h-28 w-full resize-y border bg-white px-3 py-2 text-base transition outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasStoreLayout || pendingAction !== null}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={"Rice\nBroccoli"}
            value={importText}
          />
          <FieldError
            message={
              fieldErrorScope === "import" ? fieldErrors.text?.[0] : null
            }
          />
        </label>
        <button
          className="mt-2 inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium text-zinc-800 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasStoreLayout || pendingAction !== null}
          type="submit"
        >
          <Upload aria-hidden="true" className="size-4" />
          Import
        </button>
      </form>

      <div className="mt-9 divide-y border-y">
        {items.length === 0 ? (
          <p className="py-6 text-sm text-zinc-600">No items yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id}>
              <ShoppingItemRow
                correctionFieldErrors={correctionFieldErrors}
                correctionForm={correctionForm}
                correctionMessage={correctionMessage}
                correctionOptions={correctionOptions}
                correctionOptionsError={correctionOptionsError}
                correctionOptionsLoading={correctionOptionsLoading}
                editExpanded={editItemId === item.id}
                editFieldErrors={editFieldErrors}
                editMessage={editMessage}
                editText={editText}
                item={item}
                onCheckedChange={(isChecked) => setChecked(item.id, isChecked)}
                onCorrectionFormChange={updateCorrectionForm}
                onDelete={() => deleteItem(item)}
                onEditCancel={closeEdit}
                onEditOpen={() => openEdit(item)}
                onEditSubmit={saveEdit}
                onEditTextChange={setEditText}
                onRetryCorrectionOptions={loadCorrectionOptions}
                pending={pendingCheckItemIds.has(item.id)}
                pendingCorrection={pendingCorrectionItemId === item.id}
                pendingDelete={pendingDeleteItemIds.has(item.id)}
                pendingEdit={pendingEditItemId === item.id}
                saveDisabled={!editHasChanges}
              />
            </div>
          ))
        )}
      </div>

      {message ? (
        <p className="mt-5 text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function ShoppingItemRow({
  correctionFieldErrors,
  correctionForm,
  correctionMessage,
  correctionOptions,
  correctionOptionsError,
  correctionOptionsLoading,
  editExpanded,
  editFieldErrors,
  editMessage,
  editText,
  item,
  onCheckedChange,
  onCorrectionFormChange,
  onDelete,
  onEditCancel,
  onEditOpen,
  onEditSubmit,
  onEditTextChange,
  onRetryCorrectionOptions,
  pending,
  pendingCorrection,
  pendingDelete,
  pendingEdit,
  saveDisabled,
}: {
  correctionFieldErrors: FieldErrors;
  correctionForm: ProductCorrectionFormState;
  correctionMessage: string | null;
  correctionOptions: ProductCorrectionOptions | null;
  correctionOptionsError: string | null;
  correctionOptionsLoading: boolean;
  editExpanded: boolean;
  editFieldErrors: FieldErrors;
  editMessage: string | null;
  editText: string;
  item: ActiveShoppingItemPayload;
  onCheckedChange: (isChecked: boolean) => void;
  onCorrectionFormChange: (patch: Partial<ProductCorrectionFormState>) => void;
  onDelete: () => void;
  onEditCancel: () => void;
  onEditOpen: () => void;
  onEditSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onEditTextChange: (text: string) => void;
  onRetryCorrectionOptions: () => void;
  pending: boolean;
  pendingCorrection: boolean;
  pendingDelete: boolean;
  pendingEdit: boolean;
  saveDisabled: boolean;
}) {
  const needsAttention = item.resolutionState !== "route-resolved";
  const editFormId = `edit-${item.id}`;
  const editPending = pendingEdit || pendingCorrection;

  return (
    <div className="flex min-h-16 items-center gap-3 py-3">
      <button
        aria-label={
          item.isChecked ? "Mark item unchecked" : "Mark item checked"
        }
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition ${
          item.isChecked
            ? "border-zinc-950 bg-zinc-950 text-white"
            : "border-zinc-400 bg-transparent text-transparent hover:border-zinc-950"
        }`}
        disabled={pending}
        onClick={() => onCheckedChange(!item.isChecked)}
        type="button"
      >
        <Check aria-hidden="true" className="size-4" />
      </button>

      {editExpanded ? (
        <>
          <form
            aria-label={`Edit ${item.rawText}`}
            className="min-w-0 flex-1 space-y-2"
            id={editFormId}
            onSubmit={onEditSubmit}
          >
            <label className="block">
              <span className="sr-only">Item name</span>
              <input
                className="min-h-10 w-full border bg-white px-3 text-base leading-6 outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={editPending}
                onChange={(event) => onEditTextChange(event.target.value)}
                value={editText}
              />
              <FieldError messages={editFieldErrors.text} />
              <FieldError messages={editFieldErrors.form} />
            </label>
            <InlineLocationEditor
              fieldErrors={correctionFieldErrors}
              form={correctionForm}
              item={item}
              loadingOptions={correctionOptionsLoading}
              message={correctionMessage}
              onFormChange={onCorrectionFormChange}
              onRetryOptions={onRetryCorrectionOptions}
              options={correctionOptions}
              optionsError={correctionOptionsError}
              pending={editPending}
            />
            {editMessage ? (
              <p className="text-sm text-zinc-700" role="status">
                {editMessage}
              </p>
            ) : null}
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              aria-label="Save item"
              className="inline-flex size-10 items-center justify-center border border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={editPending || saveDisabled}
              form={editFormId}
              title="Save"
              type="submit"
            >
              <Check aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Cancel edit"
              className="inline-flex size-10 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={editPending}
              onClick={onEditCancel}
              title="Cancel"
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Delete item"
              className="inline-flex size-10 items-center justify-center border text-red-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingDelete || editPending}
              onClick={onDelete}
              title="Delete"
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p
              className={`text-base leading-6 break-words ${
                item.isChecked ? "text-zinc-400 line-through" : "text-zinc-950"
              }`}
            >
              {item.rawText}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-zinc-500">
              {needsAttention ? (
                <AlertTriangle
                  aria-hidden="true"
                  className="size-4 shrink-0 text-amber-600"
                />
              ) : (
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
              )}
              <span>{locationLabel(item)}</span>
              {item.syncState !== "synced" ? (
                <span>{item.syncState}</span>
              ) : null}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              aria-controls={editFormId}
              aria-expanded={editExpanded}
              aria-label="Edit item"
              className="inline-flex size-10 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingEdit || pendingDelete}
              onClick={onEditOpen}
              title="Edit"
              type="button"
            >
              <Pencil aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Delete item"
              className="inline-flex size-10 items-center justify-center border text-red-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingDelete || pendingEdit}
              onClick={onDelete}
              title="Delete"
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InlineLocationEditor({
  fieldErrors,
  form,
  item,
  loadingOptions,
  message,
  onFormChange,
  onRetryOptions,
  options,
  optionsError,
  pending,
}: {
  fieldErrors: FieldErrors;
  form: ProductCorrectionFormState;
  item: ActiveShoppingItemPayload;
  loadingOptions: boolean;
  message: string | null;
  onFormChange: (patch: Partial<ProductCorrectionFormState>) => void;
  onRetryOptions: () => void;
  options: ProductCorrectionOptions | null;
  optionsError: string | null;
  pending: boolean;
}) {
  const productConcepts = options?.productConcepts ?? [];
  const aisleSections = options?.aisleSections ?? [];
  const isAddingCategory = form.categorySelection === ADD_CATEGORY_OPTION_VALUE;
  const selectedConceptIsMissing =
    form.categorySelection.length > 0 &&
    !isAddingCategory &&
    !productConcepts.some((concept) => concept.id === form.categorySelection);
  const selectedSectionIsMissing =
    form.aisleSectionId.length > 0 &&
    !aisleSections.some((section) => section.id === form.aisleSectionId);
  const formDisabled = pending || loadingOptions || !options || !!optionsError;
  const categoryControlId = `category-${item.id}`;

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
      <FieldError messages={fieldErrors.rawText} />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="block min-w-0">
          <label className="sr-only" htmlFor={categoryControlId}>
            Shelf category
          </label>
          {isAddingCategory ? (
            <span className="flex">
              <input
                autoFocus
                className="min-h-10 min-w-0 flex-1 border bg-white px-3 text-sm outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={formDisabled}
                id={categoryControlId}
                onChange={(event) =>
                  onFormChange({ canonicalName: event.target.value })
                }
                placeholder="New category"
                value={form.canonicalName}
              />
              <button
                aria-label="Choose existing category"
                className="inline-flex size-10 shrink-0 items-center justify-center border border-l-0 text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={formDisabled}
                onClick={() =>
                  onFormChange({
                    canonicalName: "",
                    categorySelection: "",
                  })
                }
                title="Choose existing category"
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </span>
          ) : (
            <select
              className="min-h-10 w-full border bg-white px-3 text-sm outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={formDisabled}
              id={categoryControlId}
              onChange={(event) =>
                onFormChange({
                  categorySelection: event.target.value,
                  canonicalName: "",
                })
              }
              value={form.categorySelection}
            >
              <option value="">Choose category</option>
              {selectedConceptIsMissing && item.productConcept ? (
                <option value={item.productConcept.id}>
                  {item.productConcept.canonicalName}
                </option>
              ) : null}
              {productConcepts.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.canonicalName}
                </option>
              ))}
              <option value={ADD_CATEGORY_OPTION_VALUE}>Add category</option>
            </select>
          )}
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
            {selectedSectionIsMissing && item.location ? (
              <option value={item.location.aisleSectionId}>
                {correctionSectionLabel(item.location.aisleSection)}
              </option>
            ) : null}
            {aisleSections.map((section) => (
              <option key={section.id} value={section.id}>
                {correctionSectionLabel(section)}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors.aisleSectionId} />
        </label>
      </div>

      {message ? (
        <p className="text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
function locationLabel(item: ActiveShoppingItemPayload) {
  if (item.location) {
    const { aisleSection } = item.location;
    const aisleName = aisleSection.aisleDisplayName
      ? ` · ${aisleSection.aisleDisplayName}`
      : "";
    const sectionName =
      aisleSection.label || `Section ${aisleSection.pathOrder + 1}`;

    return `Aisle ${aisleSection.aisleIdentifier}${aisleName} · ${sectionName}`;
  }

  if (item.productConcept) {
    return `${item.productConcept.canonicalName} · no saved location`;
  }

  return "Needs correction";
}

function correctionSectionLabel(section: ProductCorrectionAisleSection) {
  const aisleName = section.aisleDisplayName
    ? ` · ${section.aisleDisplayName}`
    : "";
  const sectionName = section.label || `Section ${section.pathOrder + 1}`;

  return `Aisle ${section.aisleIdentifier}${aisleName} · ${sectionName}`;
}

function FieldError({
  message,
  messages,
}: {
  message?: string | null;
  messages?: string[] | null;
}) {
  const allMessages = messages ?? (message ? [message] : []);

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
