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
    <section className="py-8">
      <p className="text-sm font-medium text-zinc-500">Stores</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
        Manage your stores.
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
        Each store has its own route, learned products, and shopping lists.
        Switch between stores with the picker in the header.
      </p>

      <form className="mt-8 flex gap-2" onSubmit={createNewStore}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">New store name</span>
          <input
            className="min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950"
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New store name"
            value={newName}
          />
        </label>
        <button
          className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating}
          type="submit"
        >
          <Plus aria-hidden="true" className="size-4" />
          {isCreating ? "Adding…" : "Add store"}
        </button>
      </form>
      {createError ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {createError}
        </p>
      ) : null}

      {stores.length === 0 ? (
        <p className="mt-8 text-base text-zinc-600">
          No stores yet. Add your first store, then build its route on the Store
          route page.
        </p>
      ) : (
        <ul className="mt-8 divide-y border">
          {stores.map((store) => {
            const isEditing = editingStoreId === store.id;
            const isPending = pendingStoreId === store.id;
            const isConfirmingDelete = confirmingDeleteId === store.id;
            const isCurrent = store.id === currentStoreId;

            return (
              <li className="p-4" key={store.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {isEditing ? (
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Store name</span>
                      <input
                        autoFocus
                        className="min-h-10 w-full border bg-white px-3 text-base outline-none focus:border-zinc-950"
                        onChange={(event) => setEditingName(event.target.value)}
                        value={editingName}
                      />
                    </label>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-950">
                        {store.name}
                      </p>
                      {isCurrent ? (
                        <p className="mt-0.5 text-xs font-medium text-zinc-500">
                          Current store
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-2">
                    {isEditing ? (
                      <button
                        aria-label={`Save name for ${store.name}`}
                        className="inline-flex size-9 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="inline-flex size-9 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="inline-flex min-h-9 items-center border border-red-700 bg-red-700 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void deleteStore(store)}
                        type="button"
                      >
                        {isPending ? "Deleting…" : "Confirm delete"}
                      </button>
                    ) : (
                      <button
                        aria-label={`Delete ${store.name}`}
                        className="inline-flex size-9 items-center justify-center border text-zinc-700 hover:border-red-700 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <p className="mt-3 text-sm text-red-700">
                    Deleting {store.name} permanently removes its route, learned
                    products, and shopping lists for everyone.
                  </p>
                ) : null}

                {rowError?.storeId === store.id ? (
                  <p className="mt-3 text-sm text-red-700" role="alert">
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
