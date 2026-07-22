import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { StoreListItem, StoreSummary } from "@/domain/stores";

import { getDb } from "@/db/client";
import {
  aisles,
  aisleSections,
  productLocations,
  stores,
  user,
} from "@/db/schema";

type FieldErrors = Record<string, string[]>;

const storeNameSchema = z
  .string()
  .trim()
  .min(1, "A store name is required.")
  .max(80, "Store names must be 80 characters or fewer.");

export const storeCreateRequestSchema = z.object({ name: storeNameSchema });
export const storeCopyRequestSchema = z.object({ name: storeNameSchema });
export const storeRenameRequestSchema = z.object({ name: storeNameSchema });
export const currentStoreRequestSchema = z.object({
  storeId: z.uuid("Choose a valid store."),
});

export class StoreRequestError extends Error {
  readonly fieldErrors: FieldErrors;
  readonly status: number;

  constructor(message: string, fieldErrors: FieldErrors, status = 422) {
    super(message);
    this.name = "StoreRequestError";
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}

const storeSummaryColumns = { id: stores.id, name: stores.name };

export async function listStores(userId: string): Promise<StoreListItem[]> {
  const db = getDb();
  const rows = await db
    .select({ ...storeSummaryColumns, createdBy: stores.createdBy })
    .from(stores)
    .orderBy(asc(stores.createdAt));

  return rows.map(({ createdBy, ...store }) => ({
    ...store,
    isOwner: canManageStore(createdBy, userId),
  }));
}

// Stores created before ownership existed have no creator; everyone can
// manage those.
function canManageStore(createdBy: string | null, userId: string): boolean {
  return createdBy === null || createdBy === userId;
}

export async function requireManageableStore(
  storeId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const [store] = await db
    .select({ createdBy: stores.createdBy })
    .from(stores)
    .where(eq(stores.id, storeId));

  if (!store) {
    throw missingStoreError();
  }

  if (!canManageStore(store.createdBy, userId)) {
    const message = "Only the user who created this store can change it.";

    throw new StoreRequestError(message, { storeId: [message] }, 403);
  }
}

export async function resolveCurrentStore(
  userId: string,
): Promise<StoreSummary | null> {
  const db = getDb();
  const [preference] = await db
    .select({ currentStoreId: user.currentStoreId })
    .from(user)
    .where(eq(user.id, userId));

  if (preference?.currentStoreId) {
    const [preferred] = await db
      .select(storeSummaryColumns)
      .from(stores)
      .where(eq(stores.id, preference.currentStoreId));

    if (preferred) {
      return preferred;
    }
  }

  const [oldest] = await db
    .select(storeSummaryColumns)
    .from(stores)
    .orderBy(asc(stores.createdAt))
    .limit(1);

  return oldest ?? null;
}

export async function setCurrentStore(
  userId: string,
  storeId: string,
): Promise<StoreSummary> {
  const db = getDb();
  const [store] = await db
    .select(storeSummaryColumns)
    .from(stores)
    .where(eq(stores.id, storeId));

  if (!store) {
    throw missingStoreError();
  }

  await db
    .update(user)
    .set({ currentStoreId: store.id, updatedAt: new Date() })
    .where(eq(user.id, userId));

  return store;
}

export async function createStore(
  name: string,
  userId: string,
): Promise<StoreSummary> {
  const db = getDb();
  const [created] = await db
    .insert(stores)
    .values({ name, createdBy: userId })
    .returning(storeSummaryColumns);

  if (!created) {
    throw new Error("The store could not be created.");
  }

  return created;
}

export async function renameStore(
  storeId: string,
  name: string,
  userId: string,
): Promise<StoreSummary> {
  await requireManageableStore(storeId, userId);

  const db = getDb();
  const [renamed] = await db
    .update(stores)
    .set({
      name,
      updatedAt: new Date(),
      version: sql`${stores.version} + 1`,
    })
    .where(eq(stores.id, storeId))
    .returning(storeSummaryColumns);

  if (!renamed) {
    throw missingStoreError();
  }

  return renamed;
}

export async function deleteStore(
  storeId: string,
  userId: string,
): Promise<void> {
  await requireManageableStore(storeId, userId);

  const db = getDb();
  // Shopping lists are per-user and survive store deletion; their items
  // resolve locations at read time, so only the store-scoped layout and
  // location data go. Learned aliases are per-user vocabulary and are not
  // touched. Remove the dependents leaf-first in one transaction.
  const [, , , deleted] = await db.batch([
    db.delete(productLocations).where(eq(productLocations.storeId, storeId)),
    db.delete(aisleSections).where(eq(aisleSections.storeId, storeId)),
    db.delete(aisles).where(eq(aisles.storeId, storeId)),
    db
      .delete(stores)
      .where(eq(stores.id, storeId))
      .returning({ id: stores.id }),
  ]);

  if (deleted.length === 0) {
    throw missingStoreError();
  }
}

function missingStoreError() {
  const message = "This store no longer exists. Refresh the page.";

  return new StoreRequestError(message, { storeId: [message] }, 404);
}
