import "server-only";

import { z } from "zod";

import { normalizeProductText } from "@/domain/product-matching";
import type { AisleSectionSide, StoreLayout } from "@/domain/store-layout";

import { getDb } from "@/db/client";
import {
  buildManualProductAliasCorrectionQuery,
  buildManualProductLocationCorrectionQuery,
  buildProductConceptByIdQuery,
  buildProductConceptByNormalizedNameQuery,
  buildProductConceptCreateQuery,
  buildProductConceptListQuery,
  type Database,
} from "@/db/repositories/product-corrections";
import type {
  ProductAlias,
  ProductConcept,
  ProductLocation,
} from "@/db/schema";

import {
  resolveProductMatchForStore,
  type StoreProductMatchResult,
} from "./product-matching";
import { getStoreLayout } from "./store-layout";

const MAX_CORRECTION_TEXT_LENGTH = 120;
const MAX_CATEGORY_NAME_LENGTH = 80;
const MAX_POSITION_WITHIN_SECTION = 9_999;

type FieldErrors = Record<string, string[]>;

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
    positionWithinSection: z
      .number()
      .int("Position must be a whole number.")
      .min(0, "Position cannot be negative.")
      .max(MAX_POSITION_WITHIN_SECTION, "Position within section is too large.")
      .nullable()
      .optional(),
  })
  .superRefine((input, context) => {
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
  });

export type ProductCorrectionRequest = z.output<
  typeof productCorrectionRequestSchema
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

export async function getProductCorrectionOptions(): Promise<ProductCorrectionOptions> {
  const db = getDb();
  const [layout, concepts] = await Promise.all([
    getStoreLayout(),
    buildProductConceptListQuery(db),
  ]);

  return {
    store: layout ? { id: layout.id, name: layout.name } : null,
    productConcepts: concepts.map(toProductConceptPayload),
    aisleSections: layout ? listAisleSections(layout) : [],
  };
}

export async function applyProductCorrection(
  input: ProductCorrectionRequest,
): Promise<ProductCorrectionResult> {
  const layout = await getStoreLayout();

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
  const productConcept = input.productConceptId
    ? await getExistingProductConcept(db, input.productConceptId)
    : await getOrCreateProductConcept(db, input.canonicalName ?? "");
  const normalizedText = normalizeProductText(input.rawText);
  const now = new Date();

  let alias: ProductAlias | undefined;
  let location: ProductLocation | undefined;

  try {
    const [aliasRows, locationRows] = await db.batch([
      buildManualProductAliasCorrectionQuery(db, {
        storeId: layout.id,
        productConceptId: productConcept.id,
        normalizedText,
        now,
      }),
      buildManualProductLocationCorrectionQuery(db, {
        storeId: layout.id,
        productConceptId: productConcept.id,
        aisleSectionId: aisleSection.id,
        positionWithinSection: input.positionWithinSection ?? null,
        now,
      }),
    ]);

    alias = aliasRows[0];
    location = locationRows[0];
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

  if (!alias || !location) {
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
    resolution: await resolveProductMatchForStore({
      storeId: layout.id,
      text: input.rawText,
    }),
  };
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

async function getOrCreateProductConcept(db: Database, canonicalName: string) {
  const normalizedName = normalizeProductText(canonicalName);

  if (!normalizedName) {
    throw new ProductCorrectionRequestError(
      "Enter a shelf category name with letters or numbers.",
      {
        canonicalName: ["Enter a shelf category name with letters or numbers."],
      },
    );
  }

  const insertedConcepts = await buildProductConceptCreateQuery(db, {
    canonicalName,
    normalizedName,
  });
  const insertedConcept = insertedConcepts[0];

  if (insertedConcept) {
    return insertedConcept;
  }

  const [existingConcept] = await buildProductConceptByNormalizedNameQuery(
    db,
    normalizedName,
  );

  if (!existingConcept) {
    throw new Error("Product concept conflict did not return an existing row.");
  }

  return existingConcept;
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

function toProductConceptPayload(
  productConcept: ProductConcept,
): ProductCorrectionProductConcept {
  return {
    id: productConcept.id,
    canonicalName: productConcept.canonicalName,
    normalizedName: productConcept.normalizedName,
  };
}

function isForeignKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  );
}
