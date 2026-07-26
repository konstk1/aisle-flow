import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteManagedProduct, requireSessionUserId, updateManagedProduct } =
  vi.hoisted(() => ({
    deleteManagedProduct: vi.fn(),
    requireSessionUserId: vi.fn(),
    updateManagedProduct: vi.fn(),
  }));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/manage-products", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/manage-products")>();

  return {
    ...actual,
    deleteManagedProduct,
    updateManagedProduct,
  };
});

import { ManageProductsRequestError } from "@/services/manage-products";

import { DELETE, PATCH } from "./route";

const userId = "user-a";
const productId = "22222222-2222-4222-8222-222222222222";
const payload = { store: null, aisleSections: [], products: [] };
const context = { params: Promise.resolve({ productId }) };

describe("product route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionUserId.mockResolvedValue(userId);
  });

  it("rejects invalid identifiers", async () => {
    const response = await PATCH(
      new Request("https://aisle-flow.example/api/products/invalid", {
        body: JSON.stringify({ canonicalName: "Rice" }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ productId: "invalid" }) },
    );

    expect(response.status).toBe(422);
    expect(updateManagedProduct).not.toHaveBeenCalled();
  });

  it("updates names without requiring a location", async () => {
    updateManagedProduct.mockResolvedValue(payload);

    const response = await PATCH(
      new Request(`https://aisle-flow.example/api/products/${productId}`, {
        body: JSON.stringify({ canonicalName: "Bulk rice" }),
        method: "PATCH",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(updateManagedProduct).toHaveBeenCalledWith(userId, productId, {
      canonicalName: "Bulk rice",
    });
  });

  it("returns ownership misses as 404", async () => {
    updateManagedProduct.mockRejectedValue(
      new ManageProductsRequestError(
        "This product no longer exists. Refresh the page.",
        { form: ["This product no longer exists. Refresh the page."] },
        404,
      ),
    );

    const response = await PATCH(
      new Request(`https://aisle-flow.example/api/products/${productId}`, {
        body: JSON.stringify({ canonicalName: "Rice" }),
        method: "PATCH",
      }),
      context,
    );

    expect(response.status).toBe(404);
  });

  it("soft-deletes an owned product", async () => {
    deleteManagedProduct.mockResolvedValue(payload);

    const response = await DELETE(
      new Request(`https://aisle-flow.example/api/products/${productId}`, {
        method: "DELETE",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(deleteManagedProduct).toHaveBeenCalledWith(userId, productId);
  });
});
