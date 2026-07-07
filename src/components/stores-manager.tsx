"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StoreListItem, StoreSummary } from "@/domain/stores";

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
  stores: StoreListItem[];
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
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
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

  async function deleteStore(store: StoreListItem) {
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
      setDeleteConfirmName("");
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
      <p className="text-[13px] font-bold tracking-[0.05em] text-ink-500 uppercase">
        Stores
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
        Manage your stores.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-400">
        Each store has its own route, learned products, and shopping lists.
        Switch between stores with the picker in the header.
      </p>

      <form className="mt-7 flex flex-col gap-2.5 sm:flex-row" onSubmit={createNewStore}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">New store name</span>
          <input
            className="h-[52px] w-full rounded-[15px] border border-black/[0.07] bg-white px-4 text-base shadow-card-sm transition outline-none focus:border-accent"
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New store name"
            value={newName}
          />
        </label>
        <button
          className="inline-flex h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-[15px] bg-gradient-to-br from-accent to-accent-bright px-5 text-base font-semibold text-white shadow-accent-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating}
          type="submit"
        >
          <Plus aria-hidden="true" className="size-[18px]" />
          {isCreating ? "Adding…" : "Add store"}
        </button>
      </form>
      {createError ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {createError}
        </p>
      ) : null}

      {stores.length === 0 ? (
        <p className="mt-7 card p-6 text-sm text-ink-400">
          No stores yet. Add your first store, then build its route on the Store
          route page.
        </p>
      ) : (
        <ul className="mt-7 divide-y divide-divider-soft overflow-hidden card">
          {stores.map((store) => {
            const isEditing = editingStoreId === store.id;
            const isPending = pendingStoreId === store.id;
            // A single pendingStoreId backs every row, so all row actions
            // lock while any request is in flight.
            const isLocked = pendingStoreId !== null;
            const isConfirmingDelete = confirmingDeleteId === store.id;
            const isCurrent = store.id === currentStoreId;
            const nameConfirmed = deleteConfirmName.trim() === store.name;

            return (
              <li className="p-4 sm:px-5" key={store.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {isEditing ? (
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Store name</span>
                      <input
                        autoFocus
                        className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-base outline-none transition focus:border-accent"
                        onChange={(event) => setEditingName(event.target.value)}
                        value={editingName}
                      />
                    </label>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {store.name}
                      </p>
                      {isCurrent ? (
                        <p className="mt-1">
                          <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent">
                            Current store
                          </span>
                        </p>
                      ) : null}
                    </div>
                  )}

                  {store.isOwner ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isEditing ? (
                        <button
                          aria-label={`Save name for ${store.name}`}
                          className="flex size-[34px] items-center justify-center rounded-[10px] bg-accent-50 text-accent transition hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isLocked}
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
                        className="flex size-[34px] items-center justify-center rounded-[10px] bg-ink-50 text-ink-500 transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isLocked}
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
                          aria-label={`Stop deleting ${store.name}`}
                          className="flex size-[34px] items-center justify-center rounded-[10px] bg-ink-50 text-ink-500 transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isLocked}
                          onClick={() => setConfirmingDeleteId(null)}
                          title="Cancel delete"
                          type="button"
                        >
                          <X aria-hidden="true" className="size-4" />
                        </button>
                      ) : (
                        <button
                          aria-label={`Delete ${store.name}`}
                          className="flex size-[34px] items-center justify-center rounded-[10px] bg-danger-50 text-danger transition hover:bg-danger-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isLocked}
                          onClick={() => {
                            setConfirmingDeleteId(store.id);
                            setDeleteConfirmName("");
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
                  ) : (
                    <p className="shrink-0 text-xs text-ink-400">
                      Only its creator can change this store.
                    </p>
                  )}
                </div>

                {isConfirmingDelete ? (
                  <div className="mt-3">
                    <p className="text-sm text-danger">
                      Deleting {store.name} permanently removes its route and
                      learned products for everyone who uses it. Shopping lists
                      are kept. Type the store name to confirm.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">
                          Type {store.name} to confirm deletion
                        </span>
                        <input
                          autoFocus
                          className="min-h-10 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-base outline-none transition focus:border-danger"
                          onChange={(event) =>
                            setDeleteConfirmName(event.target.value)
                          }
                          placeholder={store.name}
                          value={deleteConfirmName}
                        />
                      </label>
                      <button
                        className="inline-flex min-h-10 shrink-0 items-center rounded-[10px] bg-danger px-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isLocked || !nameConfirmed}
                        onClick={() => void deleteStore(store)}
                        type="button"
                      >
                        {isPending ? "Deleting…" : "Delete store"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {rowError?.storeId === store.id ? (
                  <p className="mt-3 text-sm text-danger" role="alert">
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
