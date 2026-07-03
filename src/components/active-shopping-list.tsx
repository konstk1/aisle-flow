"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  MapPin,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type {
  ActiveShoppingItemPayload,
  ActiveShoppingListPayload,
  FieldErrors,
} from "@/domain/active-shopping-list";
import { formatAisleLabel, formatSectionLabel } from "@/domain/store-layout";

import {
  ADD_PRODUCT_OPTION_VALUE,
  buildProductCorrectionRequest,
  createProductCorrectionFormState,
  getStableMutationForText,
  mergeVisibleListSnapshotAfterCheck,
  removeItemFromActiveList,
  restoreItemInActiveList,
  shouldSaveProductCorrectionForEdit,
  type PendingTextMutation,
  type ProductCorrectionFormState,
} from "./active-shopping-list-state";

type ActiveShoppingListProps = {
  initialActiveList: ActiveShoppingListPayload | null;
  hasStoreRoute: boolean;
};

type CompletedShoppingListProps = {
  initialCompletedList: ActiveShoppingListPayload | null;
  hasStoreRoute: boolean;
};

type SnoozedShoppingListProps = {
  initialSnoozedList: ActiveShoppingListPayload | null;
  hasStoreRoute: boolean;
};

type ShoppingListMode = "active" | "completed" | "snoozed";

type ShoppingListViewProps = {
  initialList: ActiveShoppingListPayload | null;
  hasStoreRoute: boolean;
  mode: ShoppingListMode;
};

type ShoppingListResponse = {
  activeList?: ActiveShoppingListPayload;
  completedList?: ActiveShoppingListPayload | null;
  snoozedList?: ActiveShoppingListPayload | null;
  list?: ActiveShoppingListPayload | null;
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

const EMPTY_ITEMS: ActiveShoppingItemPayload[] = [];
const completedDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});
const SNOOZE_LONG_PRESS_MS = 500;

type ShoppingListModeConfig = {
  listEndpoint: string;
  viewParam: string;
  responseKey: "activeList" | "completedList" | "snoozedList";
  emptyText: string;
  refreshLabel: string;
};

const MODE_CONFIG: Record<ShoppingListMode, ShoppingListModeConfig> = {
  active: {
    listEndpoint: "/api/shopping-list",
    viewParam: "",
    responseKey: "activeList",
    emptyText: "No items yet.",
    refreshLabel: "Refresh shopping list",
  },
  completed: {
    listEndpoint: "/api/shopping-list/completed",
    viewParam: "?view=completed",
    responseKey: "completedList",
    emptyText: "No completed items.",
    refreshLabel: "Refresh completed items",
  },
  snoozed: {
    listEndpoint: "/api/shopping-list/snoozed",
    viewParam: "?view=snoozed",
    responseKey: "snoozedList",
    emptyText: "No snoozed items.",
    refreshLabel: "Refresh snoozed items",
  },
};

export function ActiveShoppingList({
  hasStoreRoute,
  initialActiveList,
}: ActiveShoppingListProps) {
  return (
    <ShoppingListView
      hasStoreRoute={hasStoreRoute}
      initialList={initialActiveList}
      mode="active"
    />
  );
}

export function CompletedShoppingList({
  hasStoreRoute,
  initialCompletedList,
}: CompletedShoppingListProps) {
  return (
    <ShoppingListView
      hasStoreRoute={hasStoreRoute}
      initialList={initialCompletedList}
      mode="completed"
    />
  );
}

export function SnoozedShoppingList({
  hasStoreRoute,
  initialSnoozedList,
}: SnoozedShoppingListProps) {
  return (
    <ShoppingListView
      hasStoreRoute={hasStoreRoute}
      initialList={initialSnoozedList}
      mode="snoozed"
    />
  );
}

function ShoppingListView({
  hasStoreRoute,
  initialList,
  mode,
}: ShoppingListViewProps) {
  const [activeList, setActiveList] = useState(initialList);
  const [itemText, setItemText] = useState("");
  const [importText, setImportText] = useState("");
  const [importExpanded, setImportExpanded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [fieldErrorScope, setFieldErrorScope] =
    useState<FieldErrorScope | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingRemovalItemIds, setPendingRemovalItemIds] = useState<
    Set<string>
  >(() => new Set());
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
  const pendingRemovalItemIdsRef = useRef<Set<string>>(new Set());
  const isCompletedMode = mode === "completed";
  const isSnoozedMode = mode === "snoozed";
  const isActiveMode = mode === "active";
  const modeConfig = MODE_CONFIG[mode];
  const listEndpoint = modeConfig.listEndpoint;
  const items = activeList?.items ?? EMPTY_ITEMS;
  const itemGroups = useMemo(() => groupShoppingItemsByAisle(items), [items]);
  const editItem = items.find((item) => item.id === editItemId) ?? null;
  const editHasChanges = editItem
    ? editText !== editItem.rawText || editLocationTouched
    : false;

  function getListFromResponse(result: ShoppingListResponse) {
    if ("list" in result) {
      return { found: true, list: result.list ?? null };
    }

    if (modeConfig.responseKey in result) {
      return { found: true, list: result[modeConfig.responseKey] ?? null };
    }

    return { found: false, list: null };
  }

  function itemEndpoint(itemId: string) {
    return `/api/shopping-list/items/${itemId}${modeConfig.viewParam}`;
  }

  async function applyListResponse(
    response: Response,
    fieldScope: FieldErrorScope | null = null,
  ) {
    const result = (await response.json()) as ShoppingListResponse;
    const listResult = getListFromResponse(result);

    if (!response.ok || !listResult.found) {
      setFieldErrors(result.fieldErrors ?? {});
      setFieldErrorScope(fieldScope);
      setMessage(result.error ?? "The shopping list could not be updated.");
      return false;
    }

    setActiveList(listResult.list);
    setFieldErrors({});
    setFieldErrorScope(null);
    setMessage(null);
    return true;
  }

  async function applyRemovalListResponse(
    response: Response,
    completedItemId: string,
  ) {
    const result = (await response.json()) as ShoppingListResponse;
    const listResult = getListFromResponse(result);

    if (!response.ok || !listResult.found) {
      setFieldErrors(result.fieldErrors ?? {});
      setFieldErrorScope(null);
      setMessage(result.error ?? "The shopping list could not be updated.");
      return false;
    }

    setActiveList(
      listResult.list
        ? mergeVisibleListSnapshotAfterCheck({
            completedCheckItemId: completedItemId,
            nextList: listResult.list,
            pendingCheckItemIds: pendingRemovalItemIdsRef.current,
          })
        : null,
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
        setImportExpanded(false);
        pendingImportMutation.current = null;
      }
    } catch {
      setMessage("The items could not be imported. Check your connection.");
    } finally {
      setPendingAction(null);
    }
  }

  async function mutateItemRemoval({
    itemId,
    body,
    shouldRemoveFromVisibleList,
    updateVisibleItem,
    errorMessage,
  }: {
    itemId: string;
    body: Record<string, boolean>;
    shouldRemoveFromVisibleList: boolean;
    updateVisibleItem: (
      item: ActiveShoppingItemPayload,
    ) => ActiveShoppingItemPayload;
    errorMessage: string;
  }) {
    const previousItemIndex =
      activeList?.items.findIndex((item) => item.id === itemId) ?? -1;
    const previousItem =
      previousItemIndex >= 0 ? activeList?.items[previousItemIndex] : undefined;

    setMessage(null);
    setActiveList((current) =>
      current
        ? shouldRemoveFromVisibleList
          ? removeItemFromActiveList(current, itemId)
          : {
              ...current,
              items: current.items.map((item) =>
                item.id === itemId ? updateVisibleItem(item) : item,
              ),
            }
        : current,
    );
    setItemRemovalPending(itemId, true);

    try {
      const response = await fetch(itemEndpoint(itemId), {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!(await applyRemovalListResponse(response, itemId)) && previousItem) {
        restoreItem(previousItem, previousItemIndex);
      }
    } catch {
      if (previousItem) {
        restoreItem(previousItem, previousItemIndex);
      }
      setMessage(errorMessage);
    } finally {
      setItemRemovalPending(itemId, false);
    }
  }

  function setChecked(itemId: string, isChecked: boolean) {
    return mutateItemRemoval({
      itemId,
      body: { isChecked },
      shouldRemoveFromVisibleList:
        (isCompletedMode && !isChecked) || (!isCompletedMode && isChecked),
      updateVisibleItem: (item) => ({
        ...item,
        isChecked,
        checkedAt: isChecked ? new Date().toISOString() : null,
      }),
      errorMessage: "The item could not be updated. Check your connection.",
    });
  }

  function setSnoozed(itemId: string, snoozed: boolean) {
    return mutateItemRemoval({
      itemId,
      body: { snoozed },
      shouldRemoveFromVisibleList:
        (isSnoozedMode && !snoozed) || (!isSnoozedMode && snoozed),
      updateVisibleItem: (item) => item,
      errorMessage: snoozed
        ? "The item could not be snoozed. Check your connection."
        : "The item could not be restored. Check your connection.",
    });
  }

  function restoreItem(
    previousItem: ActiveShoppingItemPayload,
    previousItemIndex: number,
  ) {
    setActiveList((currentList) =>
      restoreItemInActiveList(currentList, previousItem, previousItemIndex),
    );
  }

  function setItemRemovalPending(itemId: string, isPending: boolean) {
    const next = new Set(pendingRemovalItemIdsRef.current);

    if (isPending) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }

    pendingRemovalItemIdsRef.current = next;
    setPendingRemovalItemIds(next);
  }

  function openEdit(item: ActiveShoppingItemPayload) {
    setEditItemId(item.id);
    setEditText(item.rawText);
    setEditFieldErrors({});
    setEditMessage(null);
    setEditLocationTouched(false);
    setCorrectionFieldErrors({});
    setCorrectionMessage(null);
    setCorrectionOptionsError(null);
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

    const shouldSaveLocation = shouldSaveProductCorrectionForEdit({
      locationTouched: editLocationTouched,
    });
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
      const response = await fetch(itemEndpoint(editItem.id), {
        body: JSON.stringify({ text: editText }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json()) as ShoppingListResponse;
      const listResult = getListFromResponse(result);

      if (!response.ok || !listResult.found) {
        setEditFieldErrors(result.fieldErrors ?? {});
        setEditMessage(result.error ?? "The item could not be updated.");
        return;
      }

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

        const refreshResponse = await fetch(listEndpoint);
        const refreshResult =
          (await refreshResponse.json()) as ShoppingListResponse;
        const refreshedList = getListFromResponse(refreshResult);

        if (!refreshResponse.ok || !refreshedList.found) {
          setCorrectionMessage(
            refreshResult.error ??
              "Location saved, but the list could not refresh.",
          );
          return;
        }

        setActiveList(refreshedList.list);
      } else {
        setActiveList(listResult.list);
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
      const response = await fetch(itemEndpoint(item.id), {
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
        current.productSelection.length === 0 &&
        options.productConcepts.length === 0
          ? { ...current, productSelection: ADD_PRODUCT_OPTION_VALUE }
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
      const response = await fetch(listEndpoint);
      await applyListResponse(response);
    } catch {
      setMessage("The shopping list could not be loaded.");
    } finally {
      setPendingAction(null);
    }
  }

  function openImport() {
    setImportExpanded(true);
    setFieldErrors({});
    setFieldErrorScope(null);
    setMessage(null);
  }

  function closeImport() {
    setImportExpanded(false);
    setImportText("");
    setFieldErrors({});
    setFieldErrorScope(null);
  }

  function renderShoppingItemRow(item: ActiveShoppingItemPayload) {
    return (
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
          mode={mode}
          onCheckedChange={(isChecked) => setChecked(item.id, isChecked)}
          onCorrectionFormChange={updateCorrectionForm}
          onDelete={() => deleteItem(item)}
          onEditCancel={closeEdit}
          onEditOpen={() => openEdit(item)}
          onEditSubmit={saveEdit}
          onEditTextChange={setEditText}
          onRetryCorrectionOptions={loadCorrectionOptions}
          onSnoozeChange={(snoozed) => setSnoozed(item.id, snoozed)}
          pending={pendingRemovalItemIds.has(item.id)}
          pendingCorrection={pendingCorrectionItemId === item.id}
          pendingDelete={pendingDeleteItemIds.has(item.id)}
          pendingEdit={pendingEditItemId === item.id}
          saveDisabled={!editHasChanges}
          showCompletedAt={isCompletedMode}
        />
      </div>
    );
  }

  return (
    <section className="pt-5 pb-12 sm:pt-7">
      {!isActiveMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            className="inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium text-zinc-800 hover:border-zinc-950"
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            List
          </Link>
          <button
            aria-label={modeConfig.refreshLabel}
            className="inline-flex size-11 shrink-0 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pendingAction !== null}
            onClick={refreshList}
            type="button"
          >
            <RotateCw aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={addItem}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Item text</span>
            <input
              className="min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pendingAction !== null}
              onChange={(event) => setItemText(event.target.value)}
              placeholder="Milk"
              value={itemText}
            />
            <FieldError
              message={fieldErrorScope === "add" ? fieldErrors.text?.[0] : null}
            />
          </label>
          <div className="flex shrink-0 gap-2">
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              disabled={pendingAction !== null}
              type="submit"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add
            </button>
            <button
              aria-expanded={importExpanded}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border px-4 text-sm font-medium text-zinc-800 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              disabled={pendingAction !== null}
              onClick={openImport}
              type="button"
            >
              <Upload aria-hidden="true" className="size-4" />
              Import
            </button>
            <button
              aria-label={modeConfig.refreshLabel}
              className="inline-flex size-11 shrink-0 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingAction !== null}
              onClick={refreshList}
              type="button"
            >
              <RotateCw aria-hidden="true" className="size-4" />
            </button>
          </div>
        </form>
      )}

      {!hasStoreRoute ? (
        <p className="mt-4 text-sm text-zinc-600">
          <Link
            className="font-medium text-zinc-950 underline-offset-4 hover:underline"
            href="/route"
          >
            Build a store route
          </Link>{" "}
          to see items in aisle order.
        </p>
      ) : null}

      {isActiveMode && importExpanded ? (
        <form className="mt-5 border-y py-4" onSubmit={importItems}>
          <label className="block text-sm font-medium text-zinc-800">
            Paste list
            <textarea
              className="mt-2 min-h-28 w-full resize-y border bg-white px-3 py-2 text-base transition outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pendingAction !== null}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"Rice\nBroccoli"}
              autoFocus
              value={importText}
            />
            <FieldError
              message={
                fieldErrorScope === "import" ? fieldErrors.text?.[0] : null
              }
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-11 items-center gap-2 border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pendingAction !== null}
              type="submit"
            >
              <Upload aria-hidden="true" className="size-4" />
              Import
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium text-zinc-800 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingAction !== null}
              onClick={closeImport}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-8 space-y-7">
        {items.length === 0 ? (
          <p className="border-y py-6 text-sm text-zinc-600">
            {modeConfig.emptyText}
          </p>
        ) : !isActiveMode ? (
          <div>{items.map(renderShoppingItemRow)}</div>
        ) : (
          itemGroups.map((group) => (
            <section key={group.id}>
              <h2 className="mb-2 text-base font-semibold text-zinc-700">
                {group.label}
              </h2>
              <div>{group.items.map(renderShoppingItemRow)}</div>
            </section>
          ))
        )}
      </div>

      {message ? (
        <p className="mt-5 text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}

      {isActiveMode ? (
        <div className="mt-8 flex flex-wrap gap-2 border-t pt-4">
          <Link
            className="inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium text-zinc-800 hover:border-zinc-950"
            href="/snoozed"
          >
            <Clock aria-hidden="true" className="size-4" />
            Snoozed
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <Link
            className="inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium text-zinc-800 hover:border-zinc-950"
            href="/completed"
          >
            <Check aria-hidden="true" className="size-4" />
            Completed
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
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
  mode,
  onCheckedChange,
  onCorrectionFormChange,
  onDelete,
  onEditCancel,
  onEditOpen,
  onEditSubmit,
  onEditTextChange,
  onRetryCorrectionOptions,
  onSnoozeChange,
  pending,
  pendingCorrection,
  pendingDelete,
  pendingEdit,
  saveDisabled,
  showCompletedAt,
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
  mode: ShoppingListMode;
  onCheckedChange: (isChecked: boolean) => void;
  onCorrectionFormChange: (patch: Partial<ProductCorrectionFormState>) => void;
  onDelete: () => void;
  onEditCancel: () => void;
  onEditOpen: () => void;
  onEditSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onEditTextChange: (text: string) => void;
  onRetryCorrectionOptions: () => void;
  onSnoozeChange: (snoozed: boolean) => void;
  pending: boolean;
  pendingCorrection: boolean;
  pendingDelete: boolean;
  pendingEdit: boolean;
  saveDisabled: boolean;
  showCompletedAt: boolean;
}) {
  const needsAttention = item.resolutionState !== "route-resolved";
  const editFormId = `edit-${item.id}`;
  const editPending = pendingEdit || pendingCorrection;
  const isActiveRow = mode === "active";
  const isSnoozedRow = mode === "snoozed";
  const longPressHandlers = useLongPress(
    () => onSnoozeChange(true),
    isActiveRow && !editExpanded && !pending && !pendingEdit && !pendingDelete,
  );

  return (
    <div className="flex min-h-16 items-center gap-3 py-3">
      {isSnoozedRow ? (
        <button
          aria-label="Restore item to list"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-400 text-zinc-600 transition hover:border-zinc-950 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
          onClick={() => onSnoozeChange(false)}
          title="Restore to list"
          type="button"
        >
          <Clock aria-hidden="true" className="size-4" />
        </button>
      ) : (
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
      )}

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
          <div
            className={`min-w-0 flex-1 ${isActiveRow ? "touch-manipulation select-none" : ""}`}
            {...longPressHandlers}
          >
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
              {showCompletedAt && item.checkedAt ? (
                <span>{formatCompletedAt(item.checkedAt)}</span>
              ) : null}
              {isSnoozedRow && item.snoozedUntil ? (
                <span>{formatSnoozedUntil(item.snoozedUntil)}</span>
              ) : null}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {isActiveRow ? (
              <button
                aria-label="Snooze item"
                className="inline-flex size-10 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending || pendingEdit || pendingDelete}
                onClick={() => onSnoozeChange(true)}
                title="Snooze"
                type="button"
              >
                <Clock aria-hidden="true" className="size-4" />
              </button>
            ) : null}
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
  const isAddingProduct = form.productSelection === ADD_PRODUCT_OPTION_VALUE;
  const selectedConceptIsMissing =
    form.productSelection.length > 0 &&
    !isAddingProduct &&
    !productConcepts.some((concept) => concept.id === form.productSelection);
  const selectedSectionIsMissing =
    form.aisleSectionId.length > 0 &&
    !aisleSections.some((section) => section.id === form.aisleSectionId);
  const formDisabled = pending || loadingOptions || !options || !!optionsError;
  const productControlId = `product-${item.id}`;

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

      {options && aisleSections.length === 0 ? (
        <p className="text-sm text-zinc-600">
          <Link
            className="font-medium text-zinc-950 underline-offset-4 hover:underline"
            href="/route"
          >
            Build a store route
          </Link>{" "}
          before assigning item locations.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="block min-w-0">
            <label className="sr-only" htmlFor={productControlId}>
              Product
            </label>
            {isAddingProduct ? (
              <span className="flex">
                <input
                  autoFocus
                  className="min-h-10 min-w-0 flex-1 border bg-white px-3 text-sm outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={formDisabled}
                  id={productControlId}
                  onChange={(event) =>
                    onFormChange({ canonicalName: event.target.value })
                  }
                  placeholder="New product"
                  value={form.canonicalName}
                />
                <button
                  aria-label="Choose existing product"
                  className="inline-flex size-10 shrink-0 items-center justify-center border border-l-0 text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={formDisabled}
                  onClick={() =>
                    onFormChange({
                      canonicalName: "",
                      productSelection: "",
                    })
                  }
                  title="Choose existing product"
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </span>
            ) : (
              <select
                className="min-h-10 w-full border bg-white px-3 text-sm outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={formDisabled}
                id={productControlId}
                onChange={(event) =>
                  onFormChange({
                    productSelection: event.target.value,
                    canonicalName: "",
                  })
                }
                value={form.productSelection}
              >
                <option value="">Choose product</option>
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
                <option value={ADD_PRODUCT_OPTION_VALUE}>Add product</option>
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
      )}

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
    return formatSectionLabel(item.location.aisleSection);
  }

  if (item.productConcept) {
    return `${item.productConcept.canonicalName} · no saved location`;
  }

  return "Needs correction";
}

function formatCompletedAt(checkedAt: string) {
  const completedAt = new Date(checkedAt);

  if (Number.isNaN(completedAt.getTime())) {
    return "Completed";
  }

  return `Completed ${completedDateFormatter.format(completedAt)}`;
}

function formatSnoozedUntil(snoozedUntil: string) {
  const target = new Date(snoozedUntil);

  if (Number.isNaN(target.getTime())) {
    return "Snoozed";
  }

  const minutes = Math.round((target.getTime() - Date.now()) / 60_000);

  if (minutes <= 0) {
    return "Resurfacing now";
  }

  if (minutes === 1) {
    return "Resurfaces in 1 min";
  }

  return `Resurfaces in ${minutes} min`;
}

function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  function cancel() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    startRef.current = null;
  }

  return {
    onPointerDown(event: React.PointerEvent) {
      if (!enabled) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      cancel();
      firedRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        firedRef.current = true;
        onLongPress();
      }, SNOOZE_LONG_PRESS_MS);
    },
    onPointerMove(event: React.PointerEvent) {
      if (!startRef.current) {
        return;
      }

      const deltaX = event.clientX - startRef.current.x;
      const deltaY = event.clientY - startRef.current.y;

      if (Math.hypot(deltaX, deltaY) > 10) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(event: React.MouseEvent) {
      if (firedRef.current) {
        event.preventDefault();
      }
    },
  };
}

type ShoppingItemGroup = {
  id: string;
  label: string;
  items: ActiveShoppingItemPayload[];
};

function groupShoppingItemsByAisle(
  items: ActiveShoppingItemPayload[],
): ShoppingItemGroup[] {
  const groups = new Map<string, ShoppingItemGroup>();

  for (const item of items) {
    const group = shoppingItemAisleGroup(item);
    const existingGroup = groups.get(group.id);

    if (existingGroup) {
      existingGroup.items.push(item);
    } else {
      groups.set(group.id, { ...group, items: [item] });
    }
  }

  return [...groups.values()];
}

function shoppingItemAisleGroup(item: ActiveShoppingItemPayload) {
  if (item.location) {
    const { aisleSection } = item.location;

    return {
      id: `aisle-${aisleSection.aisleId}`,
      label: formatAisleLabel({
        displayName: aisleSection.aisleDisplayName,
        identifier: aisleSection.aisleIdentifier,
      }),
    };
  }

  if (item.productConcept) {
    return { id: "matched-unlocated", label: "No saved location" };
  }

  return { id: "needs-correction", label: "Needs correction" };
}

function correctionSectionLabel(section: ProductCorrectionAisleSection) {
  return `${formatAisleLabel({
    displayName: section.aisleDisplayName,
    identifier: section.aisleIdentifier,
  })} · ${formatSectionLabel(section)}`;
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
