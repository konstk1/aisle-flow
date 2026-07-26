import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type {
  ManageProductsAisleSectionPayload,
  ManageProductsPayload,
} from "@/domain/manage-products";
import { normalizeProductText } from "@/domain/product-matching";
import { formatAisleLabel, formatSectionLabel } from "@/domain/store-layout";

import { getDb } from "@/db/client";
import type { Database } from "@/db/create-client";
import { isUniqueConstraintError } from "@/db/errors";
import { ensureUserProductCatalog } from "@/db/product-catalog-seed";
import {
  productAliases,
  productConcepts,
  productLocations,
  shoppingItems,
  shoppingLists,
} from "@/db/schema";

import { getCurrentStoreLayout } from "./store-layout";

const MAX_PRODUCT_NAME_LENGTH = 80;
const MAX_ALIAS_TEXT_LENGTH = 120;

const productNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a product name.")
  .max(
    MAX_PRODUCT_NAME_LENGTH,
    `Product names must be ${MAX_PRODUCT_NAME_LENGTH} characters or fewer.`,
  )
  .refine((value) => normalizeProductText(value).length > 0, {
    message: "Enter a product name with letters or numbers.",
  });

const aliasTextSchema = z
  .string()
  .trim()
  .min(1, "Enter an alias.")
  .max(
    MAX_ALIAS_TEXT_LENGTH,
    `Aliases must be ${MAX_ALIAS_TEXT_LENGTH} characters or fewer.`,
  )
  .refine((value) => normalizeProductText(value).length > 0, {
    message: "Enter an alias with letters or numbers.",
  });

export const createManagedProductSchema = z.object({
  canonicalName: productNameSchema,
  aisleSectionId: z.uuid("Choose a valid aisle section.").optional(),
});

export const updateManagedProductSchema = z
  .object({
    canonicalName: productNameSchema.optional(),
    aisleSectionId: z
      .uuid("Choose a valid aisle section.")
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.canonicalName !== undefined || value.aisleSectionId !== undefined,
    { message: "Change the product name or location.", path: ["form"] },
  );

export const createManagedAliasSchema = z.object({
  displayText: aliasTextSchema,
});

export const updateManagedAliasSchema = z
  .object({
    displayText: aliasTextSchema.optional(),
    productConceptId: z.uuid("Choose a valid product.").optional(),
  })
  .refine(
    (value) =>
      value.displayText !== undefined || value.productConceptId !== undefined,
    { message: "Change the alias text or product.", path: ["form"] },
  );

type FieldErrors = Record<string, string[]>;

export class ManageProductsRequestError extends Error {
  readonly fieldErrors: FieldErrors;
  readonly status: number;

  constructor(message: string, fieldErrors: FieldErrors, status = 422) {
    super(message);
    this.name = "ManageProductsRequestError";
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}

export async function getManageProducts(
  userId: string,
): Promise<ManageProductsPayload> {
  const db = getDb();
  await ensureUserProductCatalog(db, userId);
  const layout = await getCurrentStoreLayout(userId);

  const [conceptRows, aliasRows, locationRows, itemCountRows] =
    await Promise.all([
      db
        .select()
        .from(productConcepts)
        .where(
          and(
            eq(productConcepts.userId, userId),
            isNull(productConcepts.deletedAt),
          ),
        )
        .orderBy(asc(productConcepts.normalizedName)),
      db
        .select()
        .from(productAliases)
        .where(
          and(
            eq(productAliases.userId, userId),
            isNull(productAliases.deletedAt),
          ),
        )
        .orderBy(asc(productAliases.normalizedText)),
      layout
        ? db
            .select()
            .from(productLocations)
            .where(
              and(
                eq(productLocations.userId, userId),
                eq(productLocations.storeId, layout.id),
              ),
            )
        : Promise.resolve([]),
      db
        .select({
          productConceptId: shoppingItems.productConceptId,
          count: count(),
        })
        .from(shoppingItems)
        .innerJoin(
          shoppingLists,
          eq(shoppingItems.shoppingListId, shoppingLists.id),
        )
        .where(
          and(
            eq(shoppingLists.userId, userId),
            isNotNull(shoppingItems.productConceptId),
          ),
        )
        .groupBy(shoppingItems.productConceptId),
    ]);

  const sections = layout ? listAisleSections(layout) : [];
  const sectionLabels = new Map(
    sections.map((section) => [section.id, section.label]),
  );
  const aliasesByProduct = new Map<string, typeof aliasRows>();
  for (const alias of aliasRows) {
    const aliases = aliasesByProduct.get(alias.productConceptId) ?? [];
    aliases.push(alias);
    aliasesByProduct.set(alias.productConceptId, aliases);
  }
  const locationByProduct = new Map(
    locationRows.map((location) => [location.productConceptId, location]),
  );
  const itemCountByProduct = new Map(
    itemCountRows.flatMap((row) =>
      row.productConceptId ? [[row.productConceptId, row.count]] : [],
    ),
  );

  return {
    store: layout ? { id: layout.id, name: layout.name } : null,
    aisleSections: sections,
    products: conceptRows.map((concept) => {
      const location = locationByProduct.get(concept.id);

      return {
        id: concept.id,
        canonicalName: concept.canonicalName,
        normalizedName: concept.normalizedName,
        isSeeded: concept.seedKey !== null,
        location:
          location && sectionLabels.has(location.aisleSectionId)
            ? {
                aisleSectionId: location.aisleSectionId,
                label: sectionLabels.get(location.aisleSectionId)!,
              }
            : null,
        aliases: (aliasesByProduct.get(concept.id) ?? []).map((alias) => ({
          id: alias.id,
          displayText: alias.displayText,
          normalizedText: alias.normalizedText,
          provenance: alias.seedKey
            ? ("standard" as const)
            : ("personal" as const),
          source: alias.source,
        })),
        affectedItemCount: itemCountByProduct.get(concept.id) ?? 0,
      };
    }),
  };
}

export async function createManagedProduct(
  userId: string,
  input: z.output<typeof createManagedProductSchema>,
) {
  const db = getDb();
  await ensureUserProductCatalog(db, userId);
  const layout = await getCurrentStoreLayout(userId);
  const aisleSectionId = await requireCreateLocation(layout, input);
  const productConceptId = randomUUID();

  try {
    const conceptQuery = db
      .insert(productConcepts)
      .values({
        id: productConceptId,
        userId,
        canonicalName: input.canonicalName,
        normalizedName: normalizeProductText(input.canonicalName),
        excludedTerms: [],
      })
      .returning();

    if (layout && aisleSectionId) {
      await db.batch([
        conceptQuery,
        db.insert(productLocations).values({
          userId,
          storeId: layout.id,
          productConceptId,
          aisleSectionId,
          source: "manual",
        }),
      ]);
    } else {
      await conceptQuery;
    }
  } catch (error) {
    throwProductConflict(error);
  }

  return getManageProducts(userId);
}

export async function updateManagedProduct(
  userId: string,
  productConceptId: string,
  input: z.output<typeof updateManagedProductSchema>,
) {
  const db = getDb();
  await requireProduct(db, userId, productConceptId);
  const locationLayout =
    input.aisleSectionId === undefined
      ? null
      : await requireLocationLayout(userId, input.aisleSectionId);

  try {
    if (input.canonicalName !== undefined) {
      await db
        .update(productConcepts)
        .set({
          canonicalName: input.canonicalName,
          normalizedName: normalizeProductText(input.canonicalName),
          updatedAt: new Date(),
          version: sql`${productConcepts.version} + 1`,
        })
        .where(
          and(
            eq(productConcepts.id, productConceptId),
            eq(productConcepts.userId, userId),
            isNull(productConcepts.deletedAt),
          ),
        );
    }

    if (input.aisleSectionId !== undefined) {
      await updateProductLocation(
        db,
        userId,
        productConceptId,
        input.aisleSectionId,
        locationLayout!,
      );
    }
  } catch (error) {
    throwProductConflict(error);
  }

  return getManageProducts(userId);
}

export async function deleteManagedProduct(
  userId: string,
  productConceptId: string,
) {
  const db = getDb();
  await requireProduct(db, userId, productConceptId);
  const now = new Date();

  await db.batch([
    db
      .update(productConcepts)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(productConcepts.id, productConceptId),
          eq(productConcepts.userId, userId),
        ),
      ),
    db
      .update(productAliases)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(productAliases.userId, userId),
          eq(productAliases.productConceptId, productConceptId),
        ),
      ),
    db
      .delete(productLocations)
      .where(
        and(
          eq(productLocations.userId, userId),
          eq(productLocations.productConceptId, productConceptId),
        ),
      ),
    db
      .update(shoppingItems)
      .set({
        productConceptId: null,
        categorizationSource: null,
        updatedAt: now,
        version: sql`${shoppingItems.version} + 1`,
      })
      .where(eq(shoppingItems.productConceptId, productConceptId)),
  ]);

  return getManageProducts(userId);
}

export async function createManagedAlias(
  userId: string,
  productConceptId: string,
  input: z.output<typeof createManagedAliasSchema>,
) {
  const db = getDb();
  await requireProduct(db, userId, productConceptId);

  try {
    await db.insert(productAliases).values({
      userId,
      productConceptId,
      displayText: input.displayText,
      normalizedText: normalizeProductText(input.displayText),
      scope: "user",
      confidence: 1,
      source: "learned",
      isCorrection: true,
    });
  } catch (error) {
    throwAliasConflict(error);
  }

  return getManageProducts(userId);
}

export async function updateManagedAlias(
  userId: string,
  productConceptId: string,
  aliasId: string,
  input: z.output<typeof updateManagedAliasSchema>,
) {
  const db = getDb();
  await requireProduct(db, userId, productConceptId);
  const alias = await requireAlias(db, userId, productConceptId, aliasId);
  const nextProductConceptId = input.productConceptId ?? alias.productConceptId;

  if (nextProductConceptId !== alias.productConceptId) {
    await requireProduct(db, userId, nextProductConceptId);
  }

  try {
    await db
      .update(productAliases)
      .set({
        productConceptId: nextProductConceptId,
        ...(input.displayText !== undefined
          ? {
              displayText: input.displayText,
              normalizedText: normalizeProductText(input.displayText),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productAliases.id, aliasId),
          eq(productAliases.userId, userId),
          isNull(productAliases.deletedAt),
        ),
      );
  } catch (error) {
    throwAliasConflict(error);
  }

  return getManageProducts(userId);
}

export async function deleteManagedAlias(
  userId: string,
  productConceptId: string,
  aliasId: string,
) {
  const db = getDb();
  await requireAlias(db, userId, productConceptId, aliasId);
  const now = new Date();

  await db
    .update(productAliases)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(productAliases.id, aliasId),
        eq(productAliases.userId, userId),
        eq(productAliases.productConceptId, productConceptId),
        isNull(productAliases.deletedAt),
      ),
    );

  return getManageProducts(userId);
}

async function requireProduct(
  db: Database,
  userId: string,
  productConceptId: string,
) {
  const [product] = await db
    .select()
    .from(productConcepts)
    .where(
      and(
        eq(productConcepts.id, productConceptId),
        eq(productConcepts.userId, userId),
        isNull(productConcepts.deletedAt),
      ),
    )
    .limit(1);

  if (!product) {
    throw new ManageProductsRequestError(
      "This product no longer exists. Refresh the page.",
      { form: ["This product no longer exists. Refresh the page."] },
      404,
    );
  }

  return product;
}

async function requireAlias(
  db: Database,
  userId: string,
  productConceptId: string,
  aliasId: string,
) {
  const [alias] = await db
    .select()
    .from(productAliases)
    .where(
      and(
        eq(productAliases.id, aliasId),
        eq(productAliases.userId, userId),
        eq(productAliases.productConceptId, productConceptId),
        isNull(productAliases.deletedAt),
      ),
    )
    .limit(1);

  if (!alias) {
    throw new ManageProductsRequestError(
      "This alias no longer exists. Refresh the page.",
      { form: ["This alias no longer exists. Refresh the page."] },
      404,
    );
  }

  return alias;
}

async function requireCreateLocation(
  layout: Awaited<ReturnType<typeof getCurrentStoreLayout>>,
  input: z.output<typeof createManagedProductSchema>,
) {
  if (!layout) {
    if (input.aisleSectionId) {
      throw noStoreLocationError();
    }
    return null;
  }

  if (!input.aisleSectionId) {
    throw new ManageProductsRequestError(
      "Choose a location in the current store.",
      { aisleSectionId: ["Choose a location in the current store."] },
    );
  }

  if (
    !listAisleSections(layout).some(({ id }) => id === input.aisleSectionId)
  ) {
    throw staleSectionError();
  }

  return input.aisleSectionId;
}

async function updateProductLocation(
  db: Database,
  userId: string,
  productConceptId: string,
  aisleSectionId: string | null,
  layout: NonNullable<Awaited<ReturnType<typeof getCurrentStoreLayout>>>,
) {
  if (aisleSectionId === null) {
    await db
      .delete(productLocations)
      .where(
        and(
          eq(productLocations.userId, userId),
          eq(productLocations.storeId, layout.id),
          eq(productLocations.productConceptId, productConceptId),
        ),
      );
    return;
  }

  await db
    .insert(productLocations)
    .values({
      userId,
      storeId: layout.id,
      productConceptId,
      aisleSectionId,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [
        productLocations.userId,
        productLocations.storeId,
        productLocations.productConceptId,
      ],
      set: {
        aisleSectionId,
        source: "manual",
        updatedAt: new Date(),
        version: sql`${productLocations.version} + 1`,
      },
    });
}

async function requireLocationLayout(
  userId: string,
  aisleSectionId: string | null,
) {
  const layout = await getCurrentStoreLayout(userId);

  if (!layout) {
    throw noStoreLocationError();
  }

  if (
    aisleSectionId !== null &&
    !listAisleSections(layout).some(({ id }) => id === aisleSectionId)
  ) {
    throw staleSectionError();
  }

  return layout;
}

function listAisleSections(
  layout: NonNullable<Awaited<ReturnType<typeof getCurrentStoreLayout>>>,
): ManageProductsAisleSectionPayload[] {
  return layout.aisles
    .flatMap((aisle) =>
      aisle.sections.map((section) => ({
        id: section.id,
        label: `${formatAisleLabel(aisle)} · ${formatSectionLabel(section)}`,
        pathOrder: section.pathOrder,
      })),
    )
    .sort((first, second) => first.pathOrder - second.pathOrder)
    .map(({ id, label }) => ({ id, label }));
}

function noStoreLocationError() {
  return new ManageProductsRequestError(
    "Choose a current store before changing a product location.",
    {
      aisleSectionId: [
        "Choose a current store before changing a product location.",
      ],
    },
    409,
  );
}

function staleSectionError() {
  return new ManageProductsRequestError(
    "Choose a section in the current store.",
    { aisleSectionId: ["Choose a section in the current store."] },
    409,
  );
}

function throwProductConflict(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ManageProductsRequestError(
      "A product with this name already exists.",
      { canonicalName: ["A product with this name already exists."] },
      409,
    );
  }

  throw error;
}

function throwAliasConflict(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ManageProductsRequestError(
      "An alias with this text already exists.",
      { displayText: ["An alias with this text already exists."] },
      409,
    );
  }

  throw error;
}
