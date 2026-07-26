import { beforeEach, describe, expect, it, vi } from "vitest";

const { createManagedProduct, getManageProducts, requireSessionUserId } =
  vi.hoisted(() => ({
    createManagedProduct: vi.fn(),
    getManageProducts: vi.fn(),
    requireSessionUserId: vi.fn(),
  }));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/manage-products", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/manage-products")>();

  return { ...actual, createManagedProduct, getManageProducts };
});

import { ManageProductsRequestError } from "@/services/manage-products";

import { GET, POST } from "./route";

const userId = "user-a";
const sectionId = "33333333-3333-4333-8333-333333333333";
const payload = {
  store: { id: "store-a", name: "Market" },
  aisleSections: [],
  products: [],
};

function productRequest(body: unknown) {
  return new Request("https://aisle-flow.example/api/products", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

describe("products route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionUserId.mockResolvedValue(null);
  });

  it("rejects unauthenticated writes before parsing", async () => {
    const response = await POST(
      new Request("https://aisle-flow.example/api/products", {
        body: "not json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(createManagedProduct).not.toHaveBeenCalled();
  });

  it("returns the personal management payload", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getManageProducts.mockResolvedValue(payload);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      manageProducts: payload,
    });
    expect(getManageProducts).toHaveBeenCalledWith(userId);
  });

  it("validates product names and locations", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await POST(
      productRequest({ canonicalName: "", aisleSectionId: "invalid" }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.fieldErrors).toEqual(
      expect.objectContaining({
        canonicalName: expect.arrayContaining(["Enter a product name."]),
        aisleSectionId: ["Choose a valid aisle section."],
      }),
    );
    expect(createManagedProduct).not.toHaveBeenCalled();
  });

  it("creates a product in the current store", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    createManagedProduct.mockResolvedValue(payload);

    const response = await POST(
      productRequest({
        canonicalName: "Greek yogurt",
        aisleSectionId: sectionId,
      }),
    );

    expect(response.status).toBe(201);
    expect(createManagedProduct).toHaveBeenCalledWith(userId, {
      canonicalName: "Greek yogurt",
      aisleSectionId: sectionId,
    });
  });

  it("surfaces duplicate-name conflicts", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    createManagedProduct.mockRejectedValue(
      new ManageProductsRequestError(
        "A product with this name already exists.",
        { canonicalName: ["A product with this name already exists."] },
        409,
      ),
    );

    const response = await POST(
      productRequest({ canonicalName: "Rice", aisleSectionId: sectionId }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A product with this name already exists.",
      fieldErrors: {
        canonicalName: ["A product with this name already exists."],
      },
    });
  });
});
