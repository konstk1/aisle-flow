import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { StoreLayout } from "@/domain/store-layout";
import type { StoreSummary } from "@/domain/stores";

import { getDb } from "@/db/client";
import { aisles, aisleSections, stores, user } from "@/db/schema";
import {
  requireManageableStore,
  resolveCurrentStore,
  StoreRequestError,
} from "@/services/stores";

const MAX_ORDER = 9_999;
const ORDER_OFFSET = 100_000;

const optionalLabelSchema = z
  .string()
  .trim()
  .max(80, "Labels must be 80 characters or fewer.")
  .nullable()
  .optional()
  .transform((value) => value || null);

const sectionSchema = z.object({
  id: z.uuid(),
  label: optionalLabelSchema,
  pathOrder: z
    .number()
    .int("Path order must be a whole number.")
    .min(0, "Path order cannot be negative.")
    .max(MAX_ORDER, "Path order is too large."),
  side: z.enum(["left", "right", "center", "endcap"]),
});

const aisleSchema = z.object({
  id: z.uuid(),
  identifier: z
    .string()
    .trim()
    .min(1, "An aisle identifier is required.")
    .max(40, "Aisle identifiers must be 40 characters or fewer."),
  displayName: optionalLabelSchema,
  displayOrder: z
    .number()
    .int("Aisle order must be a whole number.")
    .min(0, "Aisle order cannot be negative.")
    .max(MAX_ORDER, "Aisle order is too large."),
  sections: z.array(sectionSchema).min(1, "Each aisle needs one section."),
});

export const storeLayoutSchema = z
  .object({
    id: z.uuid(),
    name: z
      .string()
      .trim()
      .min(1, "A store name is required.")
      .max(80, "Store names must be 80 characters or fewer."),
    aisles: z.array(aisleSchema).min(1, "Add at least one aisle."),
  })
  .superRefine((layout, context) => {
    const aisleIds = new Set<string>();
    const identifiers = new Set<string>();
    const displayOrders = new Set<number>();
    const sectionIds = new Set<string>();
    const pathOrders = new Set<number>();

    layout.aisles.forEach((aisle, aisleIndex) => {
      addDuplicateIssue(
        aisleIds,
        aisle.id,
        context,
        ["aisles", aisleIndex, "id"],
        "Each aisle must have a unique identifier.",
      );
      addDuplicateIssue(
        identifiers,
        aisle.identifier.toLocaleLowerCase(),
        context,
        ["aisles", aisleIndex, "identifier"],
        "Aisle identifiers must be unique within the store.",
      );
      addDuplicateIssue(
        displayOrders,
        aisle.displayOrder,
        context,
        ["aisles", aisleIndex, "displayOrder"],
        "Each aisle needs a different display order.",
      );
      aisle.sections.forEach((section, sectionIndex) => {
        const sectionPath = [
          "aisles",
          aisleIndex,
          "sections",
          sectionIndex,
        ] as const;
        addDuplicateIssue(
          sectionIds,
          section.id,
          context,
          [...sectionPath, "id"],
          "Each section must have a unique identifier.",
        );
        addDuplicateIssue(
          pathOrders,
          section.pathOrder,
          context,
          [...sectionPath, "pathOrder"],
          "Each section needs a different absolute path order.",
        );
      });
    });
  });

function addDuplicateIssue<T>(
  seen: Set<T>,
  value: T,
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) {
  if (seen.has(value)) {
    context.addIssue({ code: "custom", message, path });
    return;
  }

  seen.add(value);
}

export type StoreLayoutInput = z.output<typeof storeLayoutSchema>;

export async function getCurrentStoreLayout(
  userId: string,
): Promise<StoreLayout | null> {
  const currentStore = await resolveCurrentStore(userId);

  if (!currentStore) {
    return null;
  }

  return getStoreLayout(currentStore.id);
}

export async function getStoreLayout(
  storeId: string,
): Promise<StoreLayout | null> {
  const db = getDb();
  const [storeRows, rows] = await db.batch([
    db.select().from(stores).where(eq(stores.id, storeId)).limit(1),
    db
      .select({ aisle: aisles, section: aisleSections })
      .from(aisles)
      .leftJoin(aisleSections, eq(aisleSections.aisleId, aisles.id))
      .where(eq(aisles.storeId, storeId))
      .orderBy(asc(aisles.displayOrder), asc(aisleSections.pathOrder)),
  ]);
  const [store] = storeRows;

  if (!store) {
    return null;
  }

  const layoutAisles = new Map<string, StoreLayout["aisles"][number]>();

  for (const { aisle, section } of rows) {
    let layoutAisle = layoutAisles.get(aisle.id);

    if (!layoutAisle) {
      layoutAisle = {
        id: aisle.id,
        identifier: aisle.identifier,
        displayName: aisle.displayName,
        displayOrder: aisle.displayOrder,
        sections: [],
      };
      layoutAisles.set(aisle.id, layoutAisle);
    }

    if (section) {
      layoutAisle.sections.push({
        id: section.id,
        label: section.label,
        pathOrder: section.pathOrder,
        side: section.side,
      });
    }
  }

  return { id: store.id, name: store.name, aisles: [...layoutAisles.values()] };
}

export function buildStoreRouteCopy(
  source: StoreLayout,
  name: string,
): StoreLayout {
  return {
    id: crypto.randomUUID(),
    name,
    aisles: source.aisles.map((aisle) => ({
      ...aisle,
      id: crypto.randomUUID(),
      sections: aisle.sections.map((section) => ({
        ...section,
        id: crypto.randomUUID(),
      })),
    })),
  };
}

export async function copyStoreRoute(
  sourceStoreId: string,
  name: string,
  userId: string,
): Promise<StoreSummary> {
  const source = await getStoreLayout(sourceStoreId);

  if (!source) {
    const message = "This store no longer exists. Refresh the page.";
    throw new StoreRequestError(message, { sourceStoreId: [message] }, 404);
  }

  const copy = buildStoreRouteCopy(source, name);
  const db = getDb();
  const storeInsert = db.insert(stores).values({
    id: copy.id,
    name: copy.name,
    createdBy: userId,
  });
  const currentStoreUpdate = db
    .update(user)
    .set({ currentStoreId: copy.id, updatedAt: new Date() })
    .where(eq(user.id, userId));

  if (copy.aisles.length === 0) {
    await db.batch([storeInsert, currentStoreUpdate]);
    return { id: copy.id, name: copy.name };
  }

  const aisleInsert = db.insert(aisles).values(
    copy.aisles.map((aisle) => ({
      id: aisle.id,
      storeId: copy.id,
      identifier: aisle.identifier,
      displayName: aisle.displayName,
      displayOrder: aisle.displayOrder,
    })),
  );
  const copiedSections = copy.aisles.flatMap((aisle) =>
    aisle.sections.map((section) => ({
      id: section.id,
      storeId: copy.id,
      aisleId: aisle.id,
      label: section.label,
      pathOrder: section.pathOrder,
      side: section.side,
    })),
  );

  if (copiedSections.length === 0) {
    await db.batch([storeInsert, aisleInsert, currentStoreUpdate]);
  } else {
    await db.batch([
      storeInsert,
      aisleInsert,
      db.insert(aisleSections).values(copiedSections),
      currentStoreUpdate,
    ]);
  }

  return { id: copy.id, name: copy.name };
}

export async function replaceStoreLayout(
  layout: StoreLayoutInput,
  userId: string,
) {
  const existing = await getStoreLayout(layout.id);
  const db = getDb();

  if (!existing) {
    await db.batch([
      db
        .insert(stores)
        .values({ id: layout.id, name: layout.name, createdBy: userId }),
      db.insert(aisles).values(
        layout.aisles.map((aisle) => ({
          id: aisle.id,
          storeId: layout.id,
          identifier: aisle.identifier,
          displayName: aisle.displayName,
          displayOrder: aisle.displayOrder,
        })),
      ),
      db.insert(aisleSections).values(
        layout.aisles.flatMap((aisle) =>
          aisle.sections.map((section) => ({
            id: section.id,
            storeId: layout.id,
            aisleId: aisle.id,
            label: section.label,
            pathOrder: section.pathOrder,
            side: section.side,
          })),
        ),
      ),
    ]);

    return getStoreLayout(layout.id);
  }

  // Replacing a layout renames the store and rewrites its aisles, so it is
  // owner-gated like rename/delete.
  await requireManageableStore(layout.id, userId);

  const existingAisleIds = new Set(existing.aisles.map((aisle) => aisle.id));
  const existingSectionIds = new Set(
    existing.aisles.flatMap((aisle) =>
      aisle.sections.map((section) => section.id),
    ),
  );
  const incomingAisleIds = new Set(layout.aisles.map((aisle) => aisle.id));
  const incomingSections = layout.aisles.flatMap((aisle) =>
    aisle.sections.map((section) => ({ ...section, aisleId: aisle.id })),
  );
  const incomingSectionIds = new Set(
    incomingSections.map((section) => section.id),
  );
  const deletedSectionIds = [...existingSectionIds].filter(
    (id) => !incomingSectionIds.has(id),
  );
  const deletedAisleIds = [...existingAisleIds].filter(
    (id) => !incomingAisleIds.has(id),
  );
  const now = new Date();

  await db.batch([
    db
      .update(stores)
      .set({
        name: layout.name,
        updatedAt: now,
        version: sql`${stores.version} + 1`,
      })
      .where(eq(stores.id, layout.id)),
    db
      .update(aisleSections)
      .set({
        pathOrder: sql`${aisleSections.pathOrder} + ${ORDER_OFFSET}`,
      })
      .where(eq(aisleSections.storeId, layout.id)),
    db
      .update(aisles)
      .set({
        identifier: sql`concat('__pending__', ${aisles.id})`,
        displayOrder: sql`${aisles.displayOrder} + ${ORDER_OFFSET}`,
      })
      .where(eq(aisles.storeId, layout.id)),
    ...layout.aisles
      .filter((aisle) => !existingAisleIds.has(aisle.id))
      .map((aisle) =>
        db.insert(aisles).values({
          id: aisle.id,
          storeId: layout.id,
          identifier: aisle.identifier,
          displayName: aisle.displayName,
          displayOrder: aisle.displayOrder,
        }),
      ),
    ...incomingSections
      .filter((section) => existingSectionIds.has(section.id))
      .map((section) =>
        db
          .update(aisleSections)
          .set({
            aisleId: section.aisleId,
            label: section.label,
            pathOrder: section.pathOrder,
            side: section.side,
            updatedAt: now,
            version: sql`${aisleSections.version} + 1`,
          })
          .where(
            and(
              eq(aisleSections.id, section.id),
              eq(aisleSections.storeId, layout.id),
            ),
          ),
      ),
    ...incomingSections
      .filter((section) => !existingSectionIds.has(section.id))
      .map((section) =>
        db.insert(aisleSections).values({
          id: section.id,
          storeId: layout.id,
          aisleId: section.aisleId,
          label: section.label,
          pathOrder: section.pathOrder,
          side: section.side,
        }),
      ),
    ...deletedSectionIds.map((id) =>
      db
        .delete(aisleSections)
        .where(
          and(eq(aisleSections.id, id), eq(aisleSections.storeId, layout.id)),
        ),
    ),
    ...deletedAisleIds.map((id) =>
      db
        .delete(aisles)
        .where(and(eq(aisles.id, id), eq(aisles.storeId, layout.id))),
    ),
    ...layout.aisles
      .filter((aisle) => existingAisleIds.has(aisle.id))
      .map((aisle) =>
        db
          .update(aisles)
          .set({
            identifier: aisle.identifier,
            displayName: aisle.displayName,
            displayOrder: aisle.displayOrder,
            updatedAt: now,
            version: sql`${aisles.version} + 1`,
          })
          .where(and(eq(aisles.id, aisle.id), eq(aisles.storeId, layout.id))),
      ),
  ]);

  return getStoreLayout(layout.id);
}
