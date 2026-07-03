import "server-only";

import { z } from "zod";

import type {
  LearnedProductEventPayload,
  LearnedProductsPayload,
} from "@/domain/learned-products";
import { normalizeProductText } from "@/domain/product-matching";
import {
  formatAisleLabel,
  formatSectionLabel,
  type AisleSectionSide,
  type StoreLayout,
} from "@/domain/store-layout";

import { getDb } from "@/db/client";
import type { Database } from "@/db/create-client";
import { isForeignKeyError } from "@/db/errors";
import {
  buildLearnedAliasByIdQuery,
  buildLearnedAliasByTextQuery,
  buildLearnedAliasDeleteQuery,
  buildLearnedAliasListQuery,
  buildManualProductAliasCorrectionQuery,
  buildManualProductLocationCorrectionQuery,
  buildProductConceptByIdQuery,
  buildProductConceptCreateQuery,
  buildProductConceptListQuery,
  buildProductLearningEventInsertQuery,
  buildProductLearningEventListQuery,
  productConceptIdByNormalizedName,
} from "@/db/repositories/product-corrections";
import {
  buildActiveShoppingListQuery,
  buildShoppingItemProductResolutionQuery,
} from "@/db/repositories/shopping-lists";
import type {
  ProductAlias,
  ProductConcept,
  ProductLocation,
} from "@/db/schema";

import type { StoreProductMatchResult } from "./product-matching";
import { getCurrentStoreLayout } from "./store-layout";

const MAX_CORRECTION_TEXT_LENGTH = 120;
const MAX_CATEGORY_NAME_LENGTH = 80;

type FieldErrors = Record<string, string[]>;

const correctionCategoryFields = {
  productConceptId: z.uuid("Choose a valid shelf category.").optional(),
  canonicalName: z
    .string()
    .trim()
    .min(1, "Enter a shelf category name.")
    .max(
      MAX_CATEGORY_NAME_LENGTH,
      "Shelf category names must be 80 characters or fewer.",
    )
    .refine((value) => normalizeProductText(value).length > 0, {
      message: "Enter a shelf category name with letters or numbers.",
    })
    .optional(),
  aisleSectionId: z.uuid("Choose a valid aisle section."),
};

function requireExactlyOneCategory(
  input: { productConceptId?: string; canonicalName?: string },
  context: z.RefinementCtx,
) {
  const hasExistingCategory = input.productConceptId !== undefined;
  const hasNewCategory = input.canonicalName !== undefined;

  if (hasExistingCategory === hasNewCategory) {
    context.addIssue({
      code: "custom",
      message: "Choose an existing category or enter a new one.",
      path: ["productConceptId"],
    });
    context.addIssue({
      code: "custom",
      message: "Choose an existing category or enter a new one.",
      path: ["canonicalName"],
    });
  }
}

export const productCorrectionRequestSchema = z
  .object({
    rawText: z
      .string()
      .max(
        MAX_CORRECTION_TEXT_LENGTH,
        "Item text must be 120 characters or fewer.",
      )
      .refine((value) => normalizeProductText(value).length > 0, {
        message: "Enter the unresolved item text before saving a correction.",
      }),
    ...correctionCategoryFields,
  })
  .superRefine(requireExactlyOneCategory);

export type ProductCorrectionRequest = z.output<
  typeof productCorrectionRequestSchema
>;

export const learnedProductUpdateRequestSchema = z
  .object(correctionCategoryFields)
  .superRefine(requireExactlyOneCategory);

export type LearnedProductUpdateRequest = z.output<
  typeof learnedProductUpdateRequestSchema
>;

export interface ProductCorrectionProductConcept {
  id: string;
  canonicalName: string;
  normalizedName: string;
}

export interface ProductCorrectionAisleSection {
  id: string;
  aisleId: string;
  aisleIdentifier: string;
  aisleDisplayName: string | null;
  label: string | null;
  pathOrder: number;
  side: AisleSectionSide;
}

export interface ProductCorrectionOptions {
  store: { id: string; name: string } | null;
  productConcepts: ProductCorrectionProductConcept[];
  aisleSections: ProductCorrectionAisleSection[];
}

export interface ProductCorrectionResult {
  normalizedText: string;
  productConcept: ProductCorrectionProductConcept;
  alias: {
    id: string;
    normalizedText: string;
    scope: "store";
    confidence: number;
    source: "learned";
    isCorrection: true;
  };
  location: {
    id: string;
    aisleSectionId: string;
    positionWithinSection: number | null;
    confidence: number;
    source: "manual";
    aisleSection: ProductCorrectionAisleSection;
  };
  resolution: StoreProductMatchResult;
}

export class ProductCorrectionRequestError extends Error {
  readonly fieldErrors: FieldErrors;
  readonly status: number;

  constructor(message: string, fieldErrors: FieldErrors, status = 422) {
    super(message);
    this.name = "ProductCorrectionRequestError";
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}

export async function getProductCorrectionOptions(
  userId: string,
): Promise<ProductCorrectionOptions> {
  const db = getDb();
  const [layout, concepts] = await Promise.all([
    getCurrentStoreLayout(userId),
    buildProductConceptListQuery(db),
  ]);

  return {
    store: layout ? { id: layout.id, name: layout.name } : null,
    productConcepts: concepts.map(toProductConceptPayload),
    aisleSections: layout ? listAisleSections(layout) : [],
  };
}

export async function applyProductCorrection(
  userId: string,
  input: ProductCorrectionRequest,
): Promise<ProductCorrectionResult> {
  const layout = await getCurrentStoreLayout(userId);

  if (!layout) {
    throw new ProductCorrectionRequestError(
      "Create and save a store layout before correcting item locations.",
      {
        form: [
          "Create and save a store layout before correcting item locations.",
        ],
      },
      409,
    );
  }

  const aisleSection = listAisleSections(layout).find(
    (section) => section.id === input.aisleSectionId,
  );

  if (!aisleSection) {
    throw new ProductCorrectionRequestError(
      "Choose a section in the active store.",
      { aisleSectionId: ["Choose a section in the active store."] },
    );
  }

  const db = getDb();
  const normalizedText = normalizeProductText(input.rawText);
  const now = new Date();
  const [[activeList], [existingAlias]] = await Promise.all([
    buildActiveShoppingListQuery(db, userId),
    buildLearnedAliasByTextQuery(db, layout.id, normalizedText),
  ]);
  const learningAction = existingAlias ? "updated" : "created";
  const aisleSectionLabel = formatCorrectionSectionLabel(aisleSection);

  let productConcept: ProductConcept | undefined;
  let alias: ProductAlias | undefined;
  let location: ProductLocation | undefined;

  try {
    if (input.productConceptId) {
      productConcept = await getExistingProductConcept(
        db,
        input.productConceptId,
      );
      const aliasQuery = buildManualProductAliasCorrectionQuery(db, {
        storeId: layout.id,
        productConceptId: productConcept.id,
        normalizedText,
        now,
      });
      const locationQuery = buildManualProductLocationCorrectionQuery(db, {
        storeId: layout.id,
        productConceptId: productConcept.id,
        aisleSectionId: aisleSection.id,
        positionWithinSection: null,
        now,
      });
      const eventQuery = buildProductLearningEventInsertQuery(db, {
        storeId: layout.id,
        normalizedText,
        action: learningAction,
        productConceptId: productConcept.id,
        productConceptName: productConcept.canonicalName,
        aisleSectionId: aisleSection.id,
        aisleSectionLabel,
        createdByUserId: userId,
        now,
      });

      const [aliasRows, locationRows] = activeList
        ? await db.batch([
            aliasQuery,
            locationQuery,
            eventQuery,
            buildShoppingItemProductResolutionQuery(db, {
              shoppingListId: activeList.id,
              normalizedText,
              productConceptId: productConcept.id,
              now,
            }),
          ])
        : await db.batch([aliasQuery, locationQuery, eventQuery]);

      alias = aliasRows[0];
      location = locationRows[0];
    } else {
      const canonicalName = input.canonicalName;

      if (canonicalName === undefined) {
        throw new Error("Product correction category was not validated.");
      }

      const normalizedName = normalizeProductText(canonicalName);
      const productConceptId = productConceptIdByNormalizedName(normalizedName);
      const conceptQuery = buildProductConceptCreateQuery(db, {
        canonicalName,
        normalizedName,
      });
      const aliasQuery = buildManualProductAliasCorrectionQuery(db, {
        storeId: layout.id,
        productConceptId,
        normalizedText,
        now,
      });
      const locationQuery = buildManualProductLocationCorrectionQuery(db, {
        storeId: layout.id,
        productConceptId,
        aisleSectionId: aisleSection.id,
        positionWithinSection: null,
        now,
      });
      const eventQuery = buildProductLearningEventInsertQuery(db, {
        storeId: layout.id,
        normalizedText,
        action: learningAction,
        productConceptId,
        productConceptName: canonicalName,
        aisleSectionId: aisleSection.id,
        aisleSectionLabel,
        createdByUserId: userId,
        now,
      });

      const [productConceptRows, aliasRows, locationRows] = activeList
        ? await db.batch([
            conceptQuery,
            aliasQuery,
            locationQuery,
            eventQuery,
            buildShoppingItemProductResolutionQuery(db, {
              shoppingListId: activeList.id,
              normalizedText,
              productConceptId,
              now,
            }),
          ])
        : await db.batch([conceptQuery, aliasQuery, locationQuery, eventQuery]);

      productConcept = productConceptRows[0];
      alias = aliasRows[0];
      location = locationRows[0];
    }
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw new ProductCorrectionRequestError(
        "The selected category or section no longer exists. Refresh and try again.",
        {
          form: [
            "The selected category or section no longer exists. Refresh and try again.",
          ],
        },
        409,
      );
    }

    throw error;
  }

  if (!productConcept || !alias || !location) {
    throw new Error("Product correction did not return saved records.");
  }

  return {
    normalizedText,
    productConcept: toProductConceptPayload(productConcept),
    alias: {
      id: alias.id,
      normalizedText: alias.normalizedText,
      scope: "store",
      confidence: alias.confidence,
      source: "learned",
      isCorrection: true,
    },
    location: {
      id: location.id,
      aisleSectionId: location.aisleSectionId,
      positionWithinSection: location.positionWithinSection,
      confidence: location.confidence,
      source: "manual",
      aisleSection,
    },
    resolution: toCorrectionResolution({
      rawText: input.rawText,
      normalizedText,
      productConcept,
      alias,
      location,
    }),
  };
}

export async function getLearnedProducts(
  userId: string,
): Promise<LearnedProductsPayload> {
  const layout = await getCurrentStoreLayout(userId);

  if (!layout) {
    return { store: null, learnedProducts: [] };
  }

  const db = getDb();
  const [aliasRows, eventRows] = await Promise.all([
    buildLearnedAliasListQuery(db, layout.id),
    buildProductLearningEventListQuery(db, layout.id),
  ]);

  const eventsByText = new Map<string, LearnedProductEventPayload[]>();

  for (const { event, createdByName } of eventRows) {
    const events = eventsByText.get(event.normalizedText) ?? [];

    events.push({
      id: event.id,
      action: event.action,
      productConceptName: event.productConceptName,
      aisleSectionLabel: event.aisleSectionLabel,
      createdByName,
      createdAt: event.createdAt.toISOString(),
    });
    eventsByText.set(event.normalizedText, events);
  }

  return {
    store: { id: layout.id, name: layout.name },
    learnedProducts: aliasRows.map((row) => ({
      aliasId: row.alias.id,
      normalizedText: row.alias.normalizedText,
      updatedAt: row.alias.updatedAt.toISOString(),
      productConcept: toProductConceptPayload(row.productConcept),
      aisleSectionId: row.location?.aisleSectionId ?? null,
      locationLabel:
        row.aisle && row.aisleSection
          ? `${formatAisleLabel(row.aisle)} · ${formatSectionLabel(row.aisleSection)}`
          : null,
      events: eventsByText.get(row.alias.normalizedText) ?? [],
    })),
  };
}

export async function updateLearnedProduct(
  userId: string,
  aliasId: string,
  input: LearnedProductUpdateRequest,
): Promise<LearnedProductsPayload> {
  const db = getDb();
  const [alias] = await buildLearnedAliasByIdQuery(db, aliasId);

  if (!alias) {
    throw missingLearnedProductError();
  }

  const layout = await getCurrentStoreLayout(userId);

  if (!layout || alias.storeId !== layout.id) {
    throw new ProductCorrectionRequestError(
      "This learned product belongs to a different store layout.",
      { form: ["This learned product belongs to a different store layout."] },
      409,
    );
  }

  await applyProductCorrection(userId, {
    rawText: alias.normalizedText,
    productConceptId: input.productConceptId,
    canonicalName: input.canonicalName,
    aisleSectionId: input.aisleSectionId,
  });

  return getLearnedProducts(userId);
}

export async function deleteLearnedProduct(
  userId: string,
  aliasId: string,
): Promise<LearnedProductsPayload> {
  const db = getDb();
  const [alias] = await buildLearnedAliasByIdQuery(db, aliasId);

  if (!alias || !alias.storeId) {
    throw missingLearnedProductError();
  }

  const [productConcept] = await buildProductConceptByIdQuery(
    db,
    alias.productConceptId,
  );

  await db.batch([
    buildLearnedAliasDeleteQuery(db, alias.id),
    buildProductLearningEventInsertQuery(db, {
      storeId: alias.storeId,
      normalizedText: alias.normalizedText,
      action: "deleted",
      productConceptId: alias.productConceptId,
      productConceptName:
        productConcept?.canonicalName ?? alias.normalizedText,
      aisleSectionId: null,
      aisleSectionLabel: null,
      createdByUserId: userId,
    }),
  ]);

  return getLearnedProducts(userId);
}

function missingLearnedProductError() {
  const message = "This learned product no longer exists. Refresh the page.";

  return new ProductCorrectionRequestError(message, { form: [message] }, 404);
}

async function getExistingProductConcept(
  db: Database,
  productConceptId: string,
) {
  const [productConcept] = await buildProductConceptByIdQuery(
    db,
    productConceptId,
  );

  if (!productConcept) {
    throw new ProductCorrectionRequestError(
      "Choose an existing shelf category.",
      { productConceptId: ["Choose an existing shelf category."] },
    );
  }

  return productConcept;
}

function listAisleSections(
  layout: StoreLayout,
): ProductCorrectionAisleSection[] {
  return layout.aisles
    .flatMap((aisle) =>
      aisle.sections.map((section) => ({
        id: section.id,
        aisleId: aisle.id,
        aisleIdentifier: aisle.identifier,
        aisleDisplayName: aisle.displayName,
        label: section.label,
        pathOrder: section.pathOrder,
        side: section.side,
      })),
    )
    .sort((first, second) => first.pathOrder - second.pathOrder);
}

function formatCorrectionSectionLabel(section: ProductCorrectionAisleSection) {
  return `${formatAisleLabel({
    displayName: section.aisleDisplayName,
    identifier: section.aisleIdentifier,
  })} · ${formatSectionLabel(section)}`;
}

function toProductConceptPayload(
  productConcept: ProductConcept,
): ProductCorrectionProductConcept {
  return {
    id: productConcept.id,
    canonicalName: productConcept.canonicalName,
    normalizedName: productConcept.normalizedName,
  };
}

function toCorrectionResolution({
  rawText,
  normalizedText,
  productConcept,
  alias,
  location,
}: {
  rawText: string;
  normalizedText: string;
  productConcept: ProductConcept;
  alias: ProductAlias;
  location: ProductLocation;
}): StoreProductMatchResult {
  return {
    state: "matched",
    rawText,
    normalizedText,
    productConcept,
    confidence: alias.confidence,
    source: "learned-alias",
    rationale: `Used the learned exact alias “${normalizedText}”.`,
    location: {
      id: location.id,
      aisleSectionId: location.aisleSectionId,
      positionWithinSection: location.positionWithinSection,
      confidence: location.confidence,
      source: location.source,
    },
  };
}
