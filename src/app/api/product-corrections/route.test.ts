import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  applyProductCorrection,
  getProductCorrectionOptions,
  requireSessionUserId,
} = vi.hoisted(() => ({
  applyProductCorrection: vi.fn(),
  getProductCorrectionOptions: vi.fn(),
  requireSessionUserId: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/product-corrections", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/product-corrections")>();

  return {
    ...actual,
    applyProductCorrection,
    getProductCorrectionOptions,
  };
});

import { ProductCorrectionRequestError } from "@/services/product-corrections";

import { GET, POST } from "./route";

const productConceptId = "22222222-2222-4222-8222-222222222222";
const aisleSectionId = "33333333-3333-4333-8333-333333333333";
const userId = "user-a";

function correctionRequest(body: unknown) {
  return new Request("https://aisle-flow.example/api/product-corrections", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

describe("product correction route", () => {
  beforeEach(() => {
    applyProductCorrection.mockReset();
    getProductCorrectionOptions.mockReset();
    requireSessionUserId.mockReset();
    requireSessionUserId.mockResolvedValue(null);
  });

  it("rejects unauthenticated option reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getProductCorrectionOptions).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated corrections before parsing the body", async () => {
    const response = await POST(
      new Request("https://aisle-flow.example/api/product-corrections", {
        body: "not json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(applyProductCorrection).not.toHaveBeenCalled();
  });

  it("returns correction option payloads for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getProductCorrectionOptions.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      productConcepts: [],
      aisleSections: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      options: {
        store: { id: "store-1", name: "Example Market" },
        productConcepts: [],
        aisleSections: [],
      },
    });
  });

  it("returns field errors for invalid correction input", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await POST(
      correctionRequest({ rawText: "", aisleSectionId: "not-a-uuid" }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("Check the highlighted correction fields.");
    expect(body.fieldErrors).toEqual(
      expect.objectContaining({
        rawText: ["Enter the unresolved item text before saving a correction."],
        aisleSectionId: ["Choose a valid aisle section."],
        productConceptId: ["Choose an existing category or enter a new one."],
        canonicalName: ["Choose an existing category or enter a new one."],
      }),
    );
    expect(applyProductCorrection).not.toHaveBeenCalled();
  });

  it("saves valid corrections and returns the typed payload", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    applyProductCorrection.mockResolvedValue({
      normalizedText: "wild rice",
      productConcept: {
        id: productConceptId,
        canonicalName: "rice",
        normalizedName: "rice",
      },
      alias: {
        id: "alias-1",
        normalizedText: "wild rice",
        scope: "store",
        confidence: 1,
        source: "learned",
        isCorrection: true,
      },
      location: {
        id: "location-1",
        aisleSectionId,
        positionWithinSection: null,
        confidence: 1,
        source: "manual",
        aisleSection: {
          id: aisleSectionId,
          aisleId: "aisle-1",
          aisleIdentifier: "2",
          aisleDisplayName: null,
          label: "Dry goods",
          pathOrder: 1,
          side: "center",
        },
      },
      resolution: { state: "matched" },
    });

    const response = await POST(
      correctionRequest({
        rawText: "Wild Rice",
        productConceptId,
        aisleSectionId,
      }),
    );

    expect(response.status).toBe(200);
    expect(applyProductCorrection).toHaveBeenCalledWith(userId, {
      rawText: "Wild Rice",
      productConceptId,
      aisleSectionId,
    });
    await expect(response.json()).resolves.toEqual({
      correction: expect.objectContaining({
        normalizedText: "wild rice",
        alias: expect.objectContaining({
          source: "learned",
          isCorrection: true,
        }),
        location: expect.objectContaining({ source: "manual" }),
      }),
    });
  });

  it("surfaces service-level correction field errors", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    applyProductCorrection.mockRejectedValue(
      new ProductCorrectionRequestError(
        "Choose a section in the active store.",
        { aisleSectionId: ["Choose a section in the active store."] },
      ),
    );

    const response = await POST(
      correctionRequest({
        rawText: "Wild Rice",
        productConceptId,
        aisleSectionId,
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Choose a section in the active store.",
      fieldErrors: {
        aisleSectionId: ["Choose a section in the active store."],
      },
    });
  });
});
