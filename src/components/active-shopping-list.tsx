"use client";

import {
  AlertTriangle,
  Check,
  MapPin,
  Plus,
  RotateCw,
  Upload,
} from "lucide-react";
import { useState } from "react";

import type {
  ActiveShoppingItemPayload,
  ActiveShoppingListPayload,
  FieldErrors,
} from "@/domain/active-shopping-list";

type ActiveShoppingListProps = {
  initialActiveList: ActiveShoppingListPayload | null;
  hasStoreLayout: boolean;
};

type ActiveListResponse = {
  activeList?: ActiveShoppingListPayload;
  error?: string;
  fieldErrors?: FieldErrors;
};

export function ActiveShoppingList({
  hasStoreLayout,
  initialActiveList,
}: ActiveShoppingListProps) {
  const [activeList, setActiveList] = useState(initialActiveList);
  const [itemText, setItemText] = useState("");
  const [importText, setImportText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(
    hasStoreLayout ? null : "Save a store route before adding items.",
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingCheckItemIds, setPendingCheckItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const items = activeList?.items ?? [];

  async function applyListResponse(response: Response) {
    const result = (await response.json()) as ActiveListResponse;

    if (!response.ok || !result.activeList) {
      setFieldErrors(result.fieldErrors ?? {});
      setMessage(result.error ?? "The shopping list could not be updated.");
      return false;
    }

    setActiveList(result.activeList);
    setFieldErrors({});
    setMessage(null);
    return true;
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("add");

    try {
      const response = await fetch("/api/shopping-list", {
        body: JSON.stringify({
          text: itemText,
          mutationId: crypto.randomUUID(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (await applyListResponse(response)) {
        setItemText("");
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

    try {
      const response = await fetch("/api/shopping-list/import", {
        body: JSON.stringify({
          text: importText,
          mutationId: crypto.randomUUID(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (await applyListResponse(response)) {
        setImportText("");
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
    setPendingCheckItemIds((current) => new Set(current).add(itemId));

    try {
      const response = await fetch(`/api/shopping-list/items/${itemId}`, {
        body: JSON.stringify({ isChecked }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!(await applyListResponse(response)) && previousItem) {
        restoreItem(previousItem);
      }
    } catch {
      if (previousItem) {
        restoreItem(previousItem);
      }
      setMessage("The item could not be updated. Check your connection.");
    } finally {
      setPendingCheckItemIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  function restoreItem(previousItem: ActiveShoppingItemPayload) {
    setActiveList((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === previousItem.id ? previousItem : item,
            ),
          }
        : current,
    );
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
          <FieldError message={fieldErrors.text?.[0]} />
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
            <ShoppingItemRow
              item={item}
              key={item.id}
              onCheckedChange={(isChecked) => setChecked(item.id, isChecked)}
              pending={pendingCheckItemIds.has(item.id)}
            />
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
  item,
  onCheckedChange,
  pending,
}: {
  item: ActiveShoppingItemPayload;
  onCheckedChange: (isChecked: boolean) => void;
  pending: boolean;
}) {
  const needsAttention = item.resolutionState !== "route-resolved";

  return (
    <div className="flex min-h-16 items-start gap-3 py-3">
      <button
        aria-label={
          item.isChecked ? "Mark item unchecked" : "Mark item checked"
        }
        className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition ${
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
          {item.syncState !== "synced" ? <span>{item.syncState}</span> : null}
        </p>
      </div>
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

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="mt-1 block text-sm font-normal text-red-700">
      {message}
    </span>
  );
}
