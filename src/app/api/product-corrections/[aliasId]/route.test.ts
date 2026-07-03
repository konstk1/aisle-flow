import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteLearnedProduct, requireSessionUserId, updateLearnedProduct } =
  vi.hoisted(() => ({
    deleteLearnedProduct: vi.fn(),
    requireSessionUserId: vi.fn(),
    updateLearnedProduct: vi.fn(),
  }));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/product-corrections", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/product-corrections")>();

  return {
    ...actual,
    deleteLearnedProduct,
    updateLearnedProduct,
  };
});

import { ProductCorrectionRequestError } from "@/services/product-corrections";

import { DELETE, PATCH } from "./route";

const aliasId = "44444444-4444-4444-8444-444444444444";
const productConceptId = "22222222-2222-4222-8222-222222222222";
const aisleSectionId = "33333333-3333-4333-8333-333333333333";
const userId = "user-a";

const emptyPayload = {
  store: { id: "store-1", name: "Example Market" },
  learnedProducts: [],
};

function patchRequest(body: unknown) {
  return new Request(
    `https://aisle-flow.example/api/product-corrections/${aliasId}`,
    { body: JSON.stringify(body), method: "PATCH" },
  );
}

function deleteRequest() {
  return new Request(
    `https://aisle-flow.example/api/product-corrections/${aliasId}`,
    { method: "DELETE" },
  );
}

function routeContext(id = aliasId) {
  return { params: Promise.resolve({ aliasId: id }) };
}

describe("learned product route", () => {
  beforeEach(() => {
    deleteLearnedProduct.mockReset();
    requireSessionUserId.mockReset();
    updateLearnedProduct.mockReset();
    requireSessionUserId.mockResolvedValue(null);
  });

  it("rejects unauthenticated updates", async () => {
    const response = await PATCH(
      patchRequest({ productConceptId, aisleSectionId }),
      routeContext(),
    );

    expect(response.status).toBe(401);
    expect(updateLearnedProduct).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated deletes", async () => {
    const response = await DELETE(deleteRequest(), routeContext());

    expect(response.status).toBe(401);
    expect(deleteLearnedProduct).not.toHaveBeenCalled();
  });

  it("rejects malformed alias ids", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await PATCH(
      patchRequest({ productConceptId, aisleSectionId }),
      routeContext("not-a-uuid"),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      fieldErrors: { aliasId: ["Choose a valid learned product."] },
    });
    expect(updateLearnedProduct).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid update input", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await PATCH(
      patchRequest({ aisleSectionId: "not-a-uuid" }),
      routeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.fieldErrors).toEqual(
      expect.objectContaining({
        aisleSectionId: ["Choose a valid aisle section."],
        productConceptId: ["Choose an existing product or enter a new one."],
        canonicalName: ["Choose an existing product or enter a new one."],
      }),
    );
    expect(updateLearnedProduct).not.toHaveBeenCalled();
  });

  it("saves valid updates and returns the refreshed learned products", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    updateLearnedProduct.mockResolvedValue(emptyPayload);

    const response = await PATCH(
      patchRequest({ productConceptId, aisleSectionId }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(updateLearnedProduct).toHaveBeenCalledWith(userId, aliasId, {
      productConceptId,
      aisleSectionId,
    });
    await expect(response.json()).resolves.toEqual({
      learnedProducts: emptyPayload,
    });
  });

  it("deletes learnings and returns the refreshed learned products", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    deleteLearnedProduct.mockResolvedValue(emptyPayload);

    const response = await DELETE(deleteRequest(), routeContext());

    expect(response.status).toBe(200);
    expect(deleteLearnedProduct).toHaveBeenCalledWith(userId, aliasId);
    await expect(response.json()).resolves.toEqual({
      learnedProducts: emptyPayload,
    });
  });

  it("surfaces service-level errors with their status", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    deleteLearnedProduct.mockRejectedValue(
      new ProductCorrectionRequestError(
        "This learned product no longer exists. Refresh the page.",
        { form: ["This learned product no longer exists. Refresh the page."] },
        404,
      ),
    );

    const response = await DELETE(deleteRequest(), routeContext());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "This learned product no longer exists. Refresh the page.",
    });
  });
});
