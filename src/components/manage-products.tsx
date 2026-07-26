"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

import type {
  ManageProductsPayload,
  ManagedProductAliasPayload,
  ManagedProductPayload,
} from "@/domain/manage-products";

type FieldErrors = Record<string, string[]>;

type ProductsResponse = {
  manageProducts?: ManageProductsPayload;
  error?: string;
  fieldErrors?: FieldErrors;
};

export function ManageProducts({
  initialPayload,
}: {
  initialPayload: ManageProductsPayload;
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [isCreating, setIsCreating] = useState(false);

  return (
    <section className="pt-1 pb-12">
      <p className="text-ink-500 text-[13px] font-bold tracking-[0.05em] uppercase">
        Manage products
      </p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Your product catalog.
          </h1>
          <p className="text-ink-400 mt-3 max-w-2xl text-sm leading-6">
            Product names and aliases are personal to you.
            {payload.store
              ? ` Locations below apply to ${payload.store.name}.`
              : " Choose a store to manage product locations."}
          </p>
        </div>
        <button
          className="from-accent to-accent-bright shadow-accent-glow inline-flex min-h-10 items-center gap-2 rounded-[14px] bg-gradient-to-br px-4 text-sm font-semibold text-white transition hover:brightness-105"
          onClick={() => setIsCreating((current) => !current)}
          type="button"
        >
          {isCreating ? (
            <X aria-hidden="true" className="size-4" />
          ) : (
            <Plus aria-hidden="true" className="size-4" />
          )}
          {isCreating ? "Cancel" : "Add product"}
        </button>
      </div>

      {isCreating ? (
        <CreateProductForm
          onCancel={() => setIsCreating(false)}
          onSaved={(nextPayload) => {
            setPayload(nextPayload);
            setIsCreating(false);
          }}
          payload={payload}
        />
      ) : null}

      <details className="card mt-7 overflow-hidden" open>
        <summary className="hover:bg-ink-50 flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition sm:px-5">
          <span className="font-semibold">Products</span>
          <span className="text-ink-400 text-sm">
            {payload.products.length}
          </span>
        </summary>

        {payload.products.length === 0 ? (
          <p className="border-divider-soft text-ink-400 border-t p-6 text-sm">
            No products are available. Add one to start your catalog.
          </p>
        ) : (
          <div className="divide-divider-soft border-divider-soft divide-y border-t">
            {payload.products.map((product) => (
              <ProductDetails
                key={product.id}
                onPayload={setPayload}
                payload={payload}
                product={product}
              />
            ))}
          </div>
        )}
      </details>
    </section>
  );
}

function CreateProductForm({
  onCancel,
  onSaved,
  payload,
}: {
  onCancel: () => void;
  onSaved: (payload: ManageProductsPayload) => void;
  payload: ManageProductsPayload;
}) {
  const [canonicalName, setCanonicalName] = useState("");
  const [aisleSectionId, setAisleSectionId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function submit() {
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const result = await requestProducts("/api/products", {
      method: "POST",
      body: JSON.stringify({
        canonicalName,
        ...(payload.store ? { aisleSectionId } : {}),
      }),
    });

    setPending(false);
    if (!result.manageProducts) {
      const nextFieldErrors = result.fieldErrors ?? {};
      setMessage(
        hasFieldErrors(nextFieldErrors)
          ? null
          : (result.error ?? "The product could not be added."),
      );
      setFieldErrors(nextFieldErrors);
      return;
    }

    onSaved(result.manageProducts);
  }

  return (
    <div className="card mt-5 p-4 sm:p-5">
      <h2 className="font-semibold">Add product</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-ink-600 text-xs font-semibold">
            Product name
          </span>
          <input
            autoFocus
            className="focus:border-accent mt-1 min-h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-sm outline-none"
            maxLength={80}
            onChange={(event) => setCanonicalName(event.target.value)}
            value={canonicalName}
          />
          <FieldError messages={fieldErrors.canonicalName} />
        </label>
        <label className="block">
          <span className="text-ink-600 text-xs font-semibold">
            {payload.store ? `Location in ${payload.store.name}` : "Location"}
          </span>
          <select
            className="focus:border-accent mt-1 min-h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-sm outline-none disabled:opacity-60"
            disabled={!payload.store}
            onChange={(event) => setAisleSectionId(event.target.value)}
            value={aisleSectionId}
          >
            <option value="">
              {payload.store ? "Choose section" : "Choose a store first"}
            </option>
            {payload.aisleSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors.aisleSectionId} />
        </label>
      </div>
      <FieldError messages={fieldErrors.form} />
      {message ? (
        <p className="text-danger mt-3 text-sm" role="alert">
          {message}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button
          className="from-accent to-accent-bright inline-flex min-h-10 items-center rounded-xl bg-gradient-to-br px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={
            pending ||
            !canonicalName.trim() ||
            (!!payload.store && !aisleSectionId)
          }
          onClick={() => void submit()}
          type="button"
        >
          {pending ? "Adding…" : "Add product"}
        </button>
        <button
          className="text-ink-600 shadow-card-sm min-h-10 rounded-xl bg-white px-4 text-sm font-semibold"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProductDetails({
  onPayload,
  payload,
  product,
}: {
  onPayload: (payload: ManageProductsPayload) => void;
  payload: ManageProductsPayload;
  product: ManagedProductPayload;
}) {
  return (
    <details>
      <summary className="hover:bg-ink-50 cursor-pointer list-none px-4 py-4 transition sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{product.canonicalName}</span>
          <span className="text-ink-400 text-xs">
            {product.aliases.length}{" "}
            {product.aliases.length === 1 ? "alias" : "aliases"}
            {" · "}
            {product.location?.label ?? "no saved location"}
          </span>
        </div>
      </summary>
      <ProductEditor
        onPayload={onPayload}
        payload={payload}
        product={product}
      />
    </details>
  );
}

function ProductEditor({
  onPayload,
  payload,
  product,
}: {
  onPayload: (payload: ManageProductsPayload) => void;
  payload: ManageProductsPayload;
  product: ManagedProductPayload;
}) {
  const [canonicalName, setCanonicalName] = useState(product.canonicalName);
  const [aisleSectionId, setAisleSectionId] = useState(
    product.location?.aisleSectionId ?? "",
  );
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function saveProduct() {
    setPending(true);
    setMessage(null);
    setFieldErrors({});
    const result = await requestProducts(`/api/products/${product.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        canonicalName,
        ...(payload.store ? { aisleSectionId: aisleSectionId || null } : {}),
      }),
    });
    setPending(false);

    if (!result.manageProducts) {
      const nextFieldErrors = result.fieldErrors ?? {};
      setMessage(
        hasFieldErrors(nextFieldErrors)
          ? null
          : (result.error ?? "The product could not be saved."),
      );
      setFieldErrors(nextFieldErrors);
      return;
    }

    onPayload(result.manageProducts);
  }

  async function deleteProduct() {
    setPending(true);
    setMessage(null);
    const result = await requestProducts(`/api/products/${product.id}`, {
      method: "DELETE",
    });
    setPending(false);

    if (!result.manageProducts) {
      setMessage(result.error ?? "The product could not be deleted.");
      return;
    }

    onPayload(result.manageProducts);
  }

  return (
    <div className="bg-ink-50 border-divider-soft space-y-5 border-t px-4 py-5 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-ink-600 text-xs font-semibold">
            Product name
          </span>
          <input
            className="focus:border-accent mt-1 min-h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-sm outline-none"
            maxLength={80}
            onChange={(event) => setCanonicalName(event.target.value)}
            value={canonicalName}
          />
          <FieldError messages={fieldErrors.canonicalName} />
        </label>
        <label className="block">
          <span className="text-ink-600 text-xs font-semibold">
            {payload.store ? `Location in ${payload.store.name}` : "Location"}
          </span>
          <select
            className="focus:border-accent mt-1 min-h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-sm outline-none disabled:opacity-60"
            disabled={!payload.store}
            onChange={(event) => setAisleSectionId(event.target.value)}
            value={aisleSectionId}
          >
            <option value="">
              {payload.store ? "No saved location" : "Choose a store first"}
            </option>
            {payload.aisleSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors.aisleSectionId} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="from-accent to-accent-bright inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-br px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending || !canonicalName.trim()}
          onClick={() => void saveProduct()}
          type="button"
        >
          <Save aria-hidden="true" className="size-4" />
          {pending ? "Saving…" : "Save product"}
        </button>
        {confirmingDelete ? (
          <>
            <button
              className="bg-danger inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={pending}
              onClick={() => void deleteProduct()}
              type="button"
            >
              Delete product
            </button>
            <button
              className="text-ink-600 shadow-card-sm min-h-10 rounded-xl bg-white px-4 text-sm font-semibold"
              disabled={pending}
              onClick={() => setConfirmingDelete(false)}
              type="button"
            >
              Cancel
            </button>
            <span className="text-ink-500 text-xs">
              {product.affectedItemCount > 0
                ? `${product.affectedItemCount} shopping ${
                    product.affectedItemCount === 1 ? "item" : "items"
                  } will need correction.`
                : "This removes the product from future matching."}
            </span>
          </>
        ) : (
          <button
            className="text-danger bg-danger-50 inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
            onClick={() => setConfirmingDelete(true)}
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </button>
        )}
      </div>
      <FieldError messages={fieldErrors.form} />

      <AliasesEditor
        onPayload={onPayload}
        payload={payload}
        product={product}
      />

      {message ? (
        <p className="text-danger text-sm" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function AliasesEditor({
  onPayload,
  payload,
  product,
}: {
  onPayload: (payload: ManageProductsPayload) => void;
  payload: ManageProductsPayload;
  product: ManagedProductPayload;
}) {
  const [newAlias, setNewAlias] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function addAlias() {
    setPending(true);
    setMessage(null);
    const result = await requestProducts(
      `/api/products/${product.id}/aliases`,
      {
        method: "POST",
        body: JSON.stringify({ displayText: newAlias }),
      },
    );
    setPending(false);

    if (!result.manageProducts) {
      setMessage(result.error ?? "The alias could not be added.");
      return;
    }

    setNewAlias("");
    onPayload(result.manageProducts);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Aliases</h3>
        <span className="text-ink-400 text-xs">{product.aliases.length}</span>
      </div>
      {product.aliases.length > 0 ? (
        <div className="mt-2 space-y-2">
          {product.aliases.map((alias) => (
            <AliasRow
              alias={alias}
              key={alias.id}
              onPayload={onPayload}
              payload={payload}
              product={product}
            />
          ))}
        </div>
      ) : (
        <p className="text-ink-400 mt-2 text-sm">
          No aliases map to this product yet.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          aria-label={`New alias for ${product.canonicalName}`}
          className="focus:border-accent min-h-10 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 text-sm outline-none"
          maxLength={120}
          onChange={(event) => setNewAlias(event.target.value)}
          placeholder="Add alias"
          value={newAlias}
        />
        <button
          className="text-accent shadow-card-sm min-h-10 rounded-xl bg-white px-4 text-sm font-semibold disabled:opacity-50"
          disabled={pending || !newAlias.trim()}
          onClick={() => void addAlias()}
          type="button"
        >
          {pending ? "Adding…" : "Add alias"}
        </button>
      </div>
      {message ? (
        <p className="text-danger mt-2 text-sm" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function AliasRow({
  alias,
  onPayload,
  payload,
  product,
}: {
  alias: ManagedProductAliasPayload;
  onPayload: (payload: ManageProductsPayload) => void;
  payload: ManageProductsPayload;
  product: ManagedProductPayload;
}) {
  const [displayText, setDisplayText] = useState(alias.displayText);
  const [productConceptId, setProductConceptId] = useState(product.id);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function mutate(method: "PATCH" | "DELETE") {
    setPending(true);
    setMessage(null);
    const result = await requestProducts(
      `/api/products/${product.id}/aliases/${alias.id}`,
      {
        method,
        ...(method === "PATCH"
          ? {
              body: JSON.stringify({ displayText, productConceptId }),
            }
          : {}),
      },
    );
    setPending(false);

    if (!result.manageProducts) {
      setMessage(result.error ?? "The alias could not be saved.");
      return;
    }

    onPayload(result.manageProducts);
  }

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-2.5">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label>
          <span className="sr-only">Alias text</span>
          <input
            className="focus:border-accent min-h-10 w-full rounded-lg border border-black/[0.07] px-3 text-sm outline-none"
            maxLength={120}
            onChange={(event) => setDisplayText(event.target.value)}
            value={displayText}
          />
        </label>
        <label>
          <span className="sr-only">Mapped product</span>
          <select
            className="focus:border-accent min-h-10 w-full rounded-lg border border-black/[0.07] px-3 text-sm outline-none"
            onChange={(event) => setProductConceptId(event.target.value)}
            value={productConceptId}
          >
            {payload.products.map((option) => (
              <option key={option.id} value={option.id}>
                {option.canonicalName}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            aria-label={`Save alias ${alias.displayText}`}
            className="text-accent bg-ink-50 flex size-10 items-center justify-center rounded-lg disabled:opacity-50"
            disabled={pending || !displayText.trim()}
            onClick={() => void mutate("PATCH")}
            title="Save alias"
            type="button"
          >
            <Save aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label={`Delete alias ${alias.displayText}`}
            className="text-danger bg-danger-50 flex size-10 items-center justify-center rounded-lg disabled:opacity-50"
            disabled={pending}
            onClick={() => void mutate("DELETE")}
            title="Delete alias"
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <p className="text-ink-400 mt-1 text-xs">
        {alias.provenance === "standard" ? "Standard" : "Personal"} alias
      </p>
      {message ? (
        <p className="text-danger mt-1 text-xs" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

async function requestProducts(
  url: string,
  init: { method: string; body?: string },
): Promise<ProductsResponse> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    const result = (await response.json()) as ProductsResponse;

    if (!response.ok) {
      return {
        error: result.error ?? "The product update could not be saved.",
        fieldErrors: result.fieldErrors,
      };
    }

    return result;
  } catch {
    return { error: "The product update could not be saved." };
  }
}

function FieldError({ messages }: { messages?: string[] | null }) {
  if (!messages?.length) {
    return null;
  }

  return (
    <>
      {messages.map((message) => (
        <span className="text-danger mt-1 block text-sm" key={message}>
          {message}
        </span>
      ))}
    </>
  );
}

function hasFieldErrors(fieldErrors: FieldErrors) {
  return Object.values(fieldErrors).some((messages) => messages.length > 0);
}
