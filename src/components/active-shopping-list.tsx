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
  Search,
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

import { colorForKey } from "@/components/aisle-accents";
import { useShellProgress } from "@/components/shell-progress";

import { LocationChangeDialog } from "./location-change-dialog";
import { NewProductDialog } from "./new-product-dialog";
import {
  ADD_PRODUCT_OPTION_VALUE,
  NEW_PRODUCT_DIALOG_OPTION_VALUE,
  applyCorrectedConceptLocation,
  buildProductCorrectionRequest,
  buildProductSelectionPatch,
  createProductCorrectionFormState,
  getLocationChangeWarning,
  getProductSelectionState,
  getStableMutationForText,
  mergeVisibleListSnapshotAfterCheck,
  removeItemFromActiveList,
  restoreItemInActiveList,
  shouldSaveProductCorrectionForEdit,
  type LocationChangeWarning,
  type PendingTextMutation,
  type ProductCorrectionFormState,
  type ProductCorrectionRequestBody,
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
  correction?: {
    normalizedText: string;
    productConcept: {
      id: string;
      canonicalName: string;
      normalizedName: string;
    };
    location: { aisleSectionId: string };
  };
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

function itemAccentColor(item: ActiveShoppingItemPayload) {
  return colorForKey(shoppingItemAisleGroup(item).id);
}

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
  const [locationChangeConfirm, setLocationChangeConfirm] = useState<{
    warning: LocationChangeWarning;
    body: ProductCorrectionRequestBody;
  } | null>(null);
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
  const checkedCount = useMemo(
    () => items.reduce((count, item) => count + (item.isChecked ? 1 : 0), 0),
    [items],
  );

  useShellProgress(
    isActiveMode ? { checkedCount, totalCount: items.length } : null,
  );

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

    const nextList = listResult.list;
    setActiveList((current) =>
      nextList
        ? mergeVisibleListSnapshotAfterCheck({
            completedCheckItemId: null,
            currentList: current,
            nextList,
            pendingCheckItemIds: pendingRemovalItemIdsRef.current,
          })
        : nextList,
    );
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

    const nextList = listResult.list;
    setActiveList((current) =>
      nextList
        ? mergeVisibleListSnapshotAfterCheck({
            completedCheckItemId: completedItemId,
            currentList: current,
            nextList,
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
    if (isActiveMode) {
      return toggleActiveCheck(itemId, isChecked);
    }

    return mutateItemRemoval({
      itemId,
      body: { isChecked },
      shouldRemoveFromVisibleList: isCompletedMode && !isChecked,
      updateVisibleItem: (item) => ({
        ...item,
        isChecked,
        checkedAt: isChecked ? new Date().toISOString() : null,
      }),
      errorMessage: "The item could not be updated. Check your connection.",
    });
  }

  // In the active view, checking an item keeps it visible with a strikethrough
  // so the trip's progress keeps tallying it. The server retains checked items
  // on the active list for CHECKED_ITEM_RETENTION_MS before they move to the
  // completed view, so refetches keep them too; we only hold the optimistic
  // state locally while the PATCH is in flight.
  async function toggleActiveCheck(itemId: string, isChecked: boolean) {
    const previousItemIndex =
      activeList?.items.findIndex((item) => item.id === itemId) ?? -1;
    const previousItem =
      previousItemIndex >= 0 ? activeList?.items[previousItemIndex] : undefined;

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
    setItemRemovalPending(itemId, true);

    try {
      const response = await fetch(itemEndpoint(itemId), {
        body: JSON.stringify({ isChecked }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        const result = (await response.json()) as ShoppingListResponse;

        if (previousItem) {
          restoreItem(previousItem, previousItemIndex);
        }

        setMessage(result.error ?? "The item could not be updated.");
      }
    } catch {
      if (previousItem) {
        restoreItem(previousItem, previousItemIndex);
      }
      setMessage("The item could not be updated. Check your connection.");
    } finally {
      setItemRemovalPending(itemId, false);
    }
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
    setLocationChangeConfirm(null);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editItem) {
      return;
    }

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
      return;
    }

    const correctionBody = correctionRequest?.success
      ? correctionRequest.body
      : null;

    if (correctionBody) {
      const warning = getLocationChangeWarning({
        body: correctionBody,
        productConcepts: correctionOptions?.productConcepts ?? [],
        items: activeList?.items ?? [],
        excludeItemId: editItem.id,
      });

      if (warning) {
        setLocationChangeConfirm({ warning, body: correctionBody });
        return;
      }
    }

    await performSaveEdit(correctionBody);
  }

  async function performSaveEdit(
    correctionBody: ProductCorrectionRequestBody | null,
  ) {
    if (!editItem) {
      return;
    }

    setPendingEditItemId(editItem.id);

    if (correctionBody) {
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

      if (correctionBody) {
        const correctionResponse = await fetch("/api/product-corrections", {
          body: JSON.stringify(correctionBody),
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

        const corrected = correctionResult.correction;
        setCorrectionOptions((current) =>
          current
            ? {
                ...current,
                productConcepts: applyCorrectedConceptLocation(
                  current.productConcepts,
                  {
                    id: corrected.productConcept.id,
                    canonicalName: corrected.productConcept.canonicalName,
                    normalizedName: corrected.productConcept.normalizedName,
                    aisleSectionId: corrected.location.aisleSectionId,
                  },
                ),
              }
            : current,
        );

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

  function renderShoppingItemRow(
    item: ActiveShoppingItemPayload,
    accentColor: string,
  ) {
    return (
      <ShoppingItemRow
        accentColor={accentColor}
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
    );
  }

  return (
    <section className="pt-1 pb-12">
      {!isActiveMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink-900 shadow-card-sm transition hover:text-accent"
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            List
          </Link>
          <button
            aria-label={modeConfig.refreshLabel}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-ink-600 shadow-card-sm transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pendingAction !== null}
            onClick={refreshList}
            type="button"
          >
            <RotateCw aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <form
            className="flex flex-col gap-2.5 sm:flex-row"
            onSubmit={addItem}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Item text</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-200"
              />
              <input
                className="h-[52px] w-full rounded-[15px] border border-black/[0.07] bg-white pr-4 pl-11 text-base shadow-card-sm transition outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pendingAction !== null}
                onChange={(event) => setItemText(event.target.value)}
                placeholder="Add an item…"
                value={itemText}
              />
              <FieldError
                message={fieldErrorScope === "add" ? fieldErrors.text?.[0] : null}
              />
            </label>
            <div className="flex shrink-0 gap-2.5">
              <button
                className="inline-flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-[15px] bg-gradient-to-br from-accent to-accent-bright px-5 text-base font-semibold text-white shadow-accent-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                disabled={pendingAction !== null}
                type="submit"
              >
                <Plus aria-hidden="true" className="size-[18px]" />
                Add
              </button>
              <button
                aria-expanded={importExpanded}
                aria-label="Import a list"
                className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-[15px] border border-black/[0.07] bg-white text-ink-600 shadow-card-sm transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pendingAction !== null}
                onClick={openImport}
                title="Import"
                type="button"
              >
                <Upload aria-hidden="true" className="size-[19px]" />
              </button>
              <button
                aria-label={modeConfig.refreshLabel}
                className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-[15px] border border-black/[0.07] bg-white text-ink-600 shadow-card-sm transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pendingAction !== null}
                onClick={refreshList}
                title="Refresh"
                type="button"
              >
                <RotateCw aria-hidden="true" className="size-[19px]" />
              </button>
            </div>
          </form>
        </>
      )}

      {!hasStoreRoute ? (
        <p className="mt-4 text-sm text-ink-500">
          <Link
            className="font-semibold text-accent underline-offset-4 hover:underline"
            href="/route"
          >
            Build a store route
          </Link>{" "}
          to see items in aisle order.
        </p>
      ) : null}

      {isActiveMode && importExpanded ? (
        <form
          className="mt-5 card p-5"
          onSubmit={importItems}
        >
          <label className="block text-sm font-semibold text-ink-900">
            Paste list
            <textarea
              className="mt-2 min-h-28 w-full resize-y rounded-[14px] border border-black/[0.07] bg-white px-3.5 py-2.5 text-base transition outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
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
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-gradient-to-br from-accent to-accent-bright px-5 text-sm font-semibold text-white shadow-accent-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pendingAction !== null}
              type="submit"
            >
              <Upload aria-hidden="true" className="size-4" />
              Import
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-ink-50 px-5 text-sm font-semibold text-ink-600 transition hover:bg-divider disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="mt-7 space-y-6">
        {items.length === 0 ? (
          <div className="card p-6 text-sm text-ink-400">
            {modeConfig.emptyText}
          </div>
        ) : !isActiveMode ? (
          <div className="overflow-hidden card">
            {items.map((item, index) => (
              <div
                className={index > 0 ? "border-t border-divider-soft" : ""}
                key={item.id}
              >
                {renderShoppingItemRow(item, itemAccentColor(item))}
              </div>
            ))}
          </div>
        ) : (
          itemGroups.map((group) => {
            const accentColor = colorForKey(group.id);

            return (
              <section key={group.id}>
                <div className="mb-3 flex items-center gap-2.5 pl-0.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[4px]"
                    style={{ background: accentColor }}
                  />
                  <h2 className="text-[13px] font-bold tracking-[0.05em] text-ink-500 uppercase">
                    {group.label}
                  </h2>
                  <span className="rounded-full bg-divider px-2.5 py-0.5 text-xs font-semibold text-ink-250">
                    {group.items.length}
                  </span>
                </div>
                <div className="overflow-hidden card">
                  {group.items.map((item, index) => (
                    <div
                      className={index > 0 ? "border-t border-divider-soft" : ""}
                      key={item.id}
                    >
                      {renderShoppingItemRow(item, accentColor)}
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {message ? (
        <p className="mt-5 text-sm text-ink-600" role="status">
          {message}
        </p>
      ) : null}

      {isActiveMode ? (
        <div className="mt-8 flex flex-wrap gap-2.5">
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink-900 shadow-card-sm transition hover:text-accent"
            href="/snoozed"
          >
            <Clock aria-hidden="true" className="size-4 text-ink-350" />
            Snoozed
            <ArrowRight aria-hidden="true" className="size-4 text-ink-200" />
          </Link>
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink-900 shadow-card-sm transition hover:text-accent"
            href="/completed"
          >
            <Check aria-hidden="true" className="size-4 text-ink-350" />
            Completed
            <ArrowRight aria-hidden="true" className="size-4 text-ink-200" />
          </Link>
        </div>
      ) : null}

      {locationChangeConfirm ? (
        <LocationChangeDialog
          affectedItemTexts={locationChangeConfirm.warning.affectedItemTexts}
          onCancel={() => setLocationChangeConfirm(null)}
          onProceed={() => {
            const confirmed = locationChangeConfirm;
            setLocationChangeConfirm(null);
            void performSaveEdit(confirmed.body);
          }}
          productName={locationChangeConfirm.warning.productName}
          storeName={correctionOptions?.store?.name ?? null}
        />
      ) : null}
    </section>
  );
}

function ShoppingItemRow({
  accentColor,
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
  accentColor: string;
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
    <div
      className={`flex gap-4 px-[18px] py-[15px] ${
        editExpanded ? "items-start" : "items-center"
      }`}
    >
      {isSnoozedRow ? (
        <button
          aria-label="Restore item to list"
          className="relative flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 border-ink-150 bg-white text-ink-500 transition after:absolute after:-inset-[9px] hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
          onClick={() => onSnoozeChange(false)}
          title="Restore to list"
          type="button"
        >
          <Clock aria-hidden="true" className="size-3.5" />
        </button>
      ) : (
        <button
          aria-label={
            item.isChecked ? "Mark item unchecked" : "Mark item checked"
          }
          className="relative flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 transition after:absolute after:-inset-[9px] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
          onClick={() => onCheckedChange(!item.isChecked)}
          style={
            item.isChecked
              ? { borderColor: accentColor, background: accentColor }
              : { borderColor: "var(--color-ink-150)", background: "#fff" }
          }
          type="button"
        >
          <Check
            aria-hidden="true"
            className="size-3.5 text-white"
            strokeWidth={3.2}
            style={{ opacity: item.isChecked ? 1 : 0 }}
          />
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
                className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-base leading-6 outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
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
              <p className="text-sm text-ink-600" role="status">
                {editMessage}
              </p>
            ) : null}
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              aria-label="Save item"
              className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-bright text-white shadow-accent-glow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={editPending || saveDisabled}
              form={editFormId}
              title="Save"
              type="submit"
            >
              <Check aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Cancel edit"
              className="flex size-10 items-center justify-center rounded-xl bg-ink-50 text-ink-600 transition hover:bg-divider disabled:cursor-not-allowed disabled:opacity-50"
              disabled={editPending}
              onClick={onEditCancel}
              title="Cancel"
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Delete item"
              className="flex size-10 items-center justify-center rounded-xl bg-danger-50 text-danger transition hover:bg-danger-100 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div
              className="text-[16.5px] font-semibold tracking-[-0.01em] break-words"
              style={{
                color: item.isChecked ? "var(--color-ink-300)" : "var(--color-foreground)",
                textDecoration: item.isChecked ? "line-through" : "none",
              }}
            >
              {item.rawText}
            </div>
            <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-400">
              {needsAttention ? (
                <AlertTriangle
                  aria-hidden="true"
                  className="size-3 shrink-0 text-amber-500"
                />
              ) : (
                <MapPin
                  aria-hidden="true"
                  className="size-3 shrink-0"
                  strokeWidth={2.2}
                  style={{ color: accentColor }}
                />
              )}
              <span>{locationLabel(item)}</span>
              {showCompletedAt && item.checkedAt ? (
                <span>{formatCompletedAt(item.checkedAt)}</span>
              ) : null}
              {isSnoozedRow && item.snoozedUntil ? (
                <span>{formatSnoozedUntil(item.snoozedUntil)}</span>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {isActiveRow ? (
              <button
                aria-label="Snooze item"
                className="relative flex size-[34px] items-center justify-center rounded-[10px] bg-ink-50 text-ink-500 transition after:absolute after:-inset-y-[5px] after:-inset-x-px hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
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
              className="relative flex size-[34px] items-center justify-center rounded-[10px] bg-ink-50 text-ink-500 transition after:absolute after:-inset-y-[5px] after:-inset-x-px hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingEdit || pendingDelete}
              onClick={onEditOpen}
              title="Edit"
              type="button"
            >
              <Pencil aria-hidden="true" className="size-[15px]" />
            </button>
            <button
              aria-label="Delete item"
              className="relative flex size-[34px] items-center justify-center rounded-[10px] bg-danger-50 text-danger transition after:absolute after:-inset-y-[5px] after:-inset-x-px hover:bg-danger-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingDelete || pendingEdit}
              onClick={onDelete}
              title="Delete"
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-[15px]" />
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
  const { isAddingProduct, selectedConceptIsMissing, selectValue } =
    getProductSelectionState(form, productConcepts);
  const selectedSectionIsMissing =
    form.aisleSectionId.length > 0 &&
    !aisleSections.some((section) => section.id === form.aisleSectionId);
  const formDisabled = pending || loadingOptions || !options || !!optionsError;
  const productControlId = `product-${item.id}`;
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
            className="flex size-9 items-center justify-center rounded-[10px] bg-ink-50 text-ink-500 transition hover:text-accent"
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
        <p className="text-sm text-ink-400">
          <Link
            className="font-semibold text-accent underline-offset-4 hover:underline"
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
            <select
              className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-sm outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
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
              className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-sm outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
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
        <p className="text-sm text-ink-600" role="status">
          {message}
        </p>
      ) : null}

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
            label: correctionSectionLabel(section),
          }))}
          storeName={options?.store?.name ?? null}
        />
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
          className="mt-1 block text-sm font-medium text-danger"
          key={`${fieldMessage}-${index}`}
        >
          {fieldMessage}
        </span>
      ))}
    </>
  );
}
