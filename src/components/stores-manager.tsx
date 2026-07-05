"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StoreSummary } from "@/domain/stores";

type StoreMutationResponse = {
  store?: StoreSummary;
  deleted?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export function StoresManager({
  stores,
  currentStoreId,
}: {
  stores: StoreSummary[];
  currentStoreId: string | null;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    storeId: string;
    message: string;
  } | null>(null);

  async function createNewStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/stores", {
        body: JSON.stringify({ name: newName }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as StoreMutationResponse;

      if (!response.ok || !result.store) {
        setCreateError(
          result.fieldErrors?.name?.[0] ??
            result.error ??
            "The store could not be created.",
        );
        return;
      }

      setNewName("");
      router.refresh();
    } catch {
      setCreateError("The store could not be created.");
    } finally {
      setIsCreating(false);
    }
  }

  function startRenaming(store: StoreSummary) {
    setEditingStoreId(store.id);
    setEditingName(store.name);
    setConfirmingDeleteId(null);
    setRowError(null);
  }

  async function saveRename(store: StoreSummary) {
    setPendingStoreId(store.id);
    setRowError(null);

    try {
      const response = await fetch(`/api/stores/${store.id}`, {
        body: JSON.stringify({ name: editingName }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json()) as StoreMutationResponse;

      if (!response.ok || !result.store) {
        setRowError({
          storeId: store.id,
          message:
            result.fieldErrors?.name?.[0] ??
            result.error ??
            "The store could not be renamed.",
        });
        return;
      }

      setEditingStoreId(null);
      router.refresh();
    } catch {
      setRowError({
        storeId: store.id,
        message: "The store could not be renamed.",
      });
    } finally {
      setPendingStoreId(null);
    }
  }

  async function deleteStore(store: StoreSummary) {
    setPendingStoreId(store.id);
    setRowError(null);

    try {
      const response = await fetch(`/api/stores/${store.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as StoreMutationResponse;

      if (!response.ok || !result.deleted) {
        setRowError({
          storeId: store.id,
          message: result.error ?? "The store could not be deleted.",
        });
        return;
      }

      setConfirmingDeleteId(null);
      router.refresh();
    } catch {
      setRowError({
        storeId: store.id,
        message: "The store could not be deleted.",
      });
    } finally {
      setPendingStoreId(null);
    }
  }

  return (
    <section className="pt-1 pb-12">
      <p className="text-[13px] font-bold tracking-[0.05em] text-[#8a8a92] uppercase">
        Stores
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
        Manage your stores.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9a9aa2]">
        Each store has its own route, learned products, and shopping lists.
        Switch between stores with the picker in the header.
      </p>

      <form className="mt-7 flex flex-col gap-2.5 sm:flex-row" onSubmit={createNewStore}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">New store name</span>
          <input
            className="h-[52px] w-full rounded-[15px] border border-black/[0.07] bg-white px-4 text-base shadow-[0_2px_14px_rgba(20,23,40,0.05)] transition outline-none focus:border-[#0a84ff]"
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New store name"
            value={newName}
          />
        </label>
        <button
          className="inline-flex h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-[15px] bg-gradient-to-br from-[#0a84ff] to-[#3b9dff] px-5 text-base font-semibold text-white shadow-[0_6px_16px_rgba(10,132,255,0.32)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating}
          type="submit"
        >
          <Plus aria-hidden="true" className="size-[18px]" />
          {isCreating ? "Adding…" : "Add store"}
        </button>
      </form>
      {createError ? (
        <p className="mt-2 text-sm text-[#ff453a]" role="alert">
          {createError}
        </p>
      ) : null}

      {stores.length === 0 ? (
        <p className="mt-7 rounded-[20px] bg-white p-6 text-sm text-[#9a9aa2] shadow-[0_2px_20px_rgba(20,23,40,0.06)]">
          No stores yet. Add your first store, then build its route on the Store
          route page.
        </p>
      ) : (
        <ul className="mt-7 divide-y divide-[#f0f1f5] overflow-hidden rounded-[20px] bg-white shadow-[0_2px_20px_rgba(20,23,40,0.06)]">
          {stores.map((store) => {
            const isEditing = editingStoreId === store.id;
            const isPending = pendingStoreId === store.id;
            const isConfirmingDelete = confirmingDeleteId === store.id;
            const isCurrent = store.id === currentStoreId;

            return (
              <li className="p-4 sm:px-5" key={store.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {isEditing ? (
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Store name</span>
                      <input
                        autoFocus
                        className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-base outline-none transition focus:border-[#0a84ff]"
                        onChange={(event) => setEditingName(event.target.value)}
                        value={editingName}
                      />
                    </label>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1c1c24]">
                        {store.name}
                      </p>
                      {isCurrent ? (
                        <p className="mt-1">
                          <span className="rounded-full bg-[#e5f1ff] px-2.5 py-0.5 text-xs font-semibold text-[#0a84ff]">
                            Current store
                          </span>
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isEditing ? (
                      <button
                        aria-label={`Save name for ${store.name}`}
                        className="flex size-[34px] items-center justify-center rounded-[10px] bg-[#e5f1ff] text-[#0a84ff] transition hover:bg-[#d8e9fc] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void saveRename(store)}
                        title="Save"
                        type="button"
                      >
                        <Check aria-hidden="true" className="size-4" />
                      </button>
                    ) : null}
                    <button
                      aria-label={
                        isEditing
                          ? `Stop renaming ${store.name}`
                          : `Rename ${store.name}`
                      }
                      className="flex size-[34px] items-center justify-center rounded-[10px] bg-[#f4f5f9] text-[#8a8a92] transition hover:text-[#0a84ff] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isPending}
                      onClick={() =>
                        isEditing
                          ? setEditingStoreId(null)
                          : startRenaming(store)
                      }
                      title={isEditing ? "Cancel" : "Rename"}
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
                        className="inline-flex min-h-[34px] items-center rounded-[10px] bg-[#ff453a] px-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void deleteStore(store)}
                        type="button"
                      >
                        {isPending ? "Deleting…" : "Confirm delete"}
                      </button>
                    ) : (
                      <button
                        aria-label={`Delete ${store.name}`}
                        className="flex size-[34px] items-center justify-center rounded-[10px] bg-[#fdeeee] text-[#ff453a] transition hover:bg-[#fbdede] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => {
                          setConfirmingDeleteId(store.id);
                          setEditingStoreId(null);
                          setRowError(null);
                        }}
                        title="Delete"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isConfirmingDelete ? (
                  <p className="mt-3 text-sm text-[#ff453a]">
                    Deleting {store.name} permanently removes its route, learned
                    products, and shopping lists for everyone.
                  </p>
                ) : null}

                {rowError?.storeId === store.id ? (
                  <p className="mt-3 text-sm text-[#ff453a]" role="alert">
                    {rowError.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
