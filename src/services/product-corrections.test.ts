import { describe, expect, it } from "vitest";

import { productCorrectionRequestSchema } from "./product-corrections";

const validSectionId = "33333333-3333-4333-8333-333333333333";
const validConceptId = "22222222-2222-4222-8222-222222222222";

describe("productCorrectionRequestSchema", () => {
  it("accepts an unresolved phrase with an existing category and section", () => {
    const result = productCorrectionRequestSchema.parse({
      rawText: "Wild Rice",
      productConceptId: validConceptId,
      aisleSectionId: validSectionId,
      positionWithinSection: null,
    });

    expect(result).toEqual({
      rawText: "Wild Rice",
      productConceptId: validConceptId,
      aisleSectionId: validSectionId,
      positionWithinSection: null,
    });
  });

  it("accepts a new category name instead of an existing category id", () => {
    const result = productCorrectionRequestSchema.parse({
      rawText: "dried mango",
      canonicalName: "Dried fruit",
      aisleSectionId: validSectionId,
    });

    expect(result).toMatchObject({
      rawText: "dried mango",
      canonicalName: "Dried fruit",
      aisleSectionId: validSectionId,
    });
  });

  it("requires exactly one category selection mode", () => {
    const missing = productCorrectionRequestSchema.safeParse({
      rawText: "wild rice",
      aisleSectionId: validSectionId,
    });
    const duplicate = productCorrectionRequestSchema.safeParse({
      rawText: "wild rice",
      productConceptId: validConceptId,
      canonicalName: "rice",
      aisleSectionId: validSectionId,
    });

    expect(missing.success).toBe(false);
    expect(duplicate.success).toBe(false);
    if (!missing.success && !duplicate.success) {
      expect(missing.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["productConceptId"] }),
          expect.objectContaining({ path: ["canonicalName"] }),
        ]),
      );
      expect(duplicate.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["productConceptId"] }),
          expect.objectContaining({ path: ["canonicalName"] }),
        ]),
      );
    }
  });
});
