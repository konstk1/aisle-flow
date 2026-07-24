import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteManagedAlias, requireSessionUserId, updateManagedAlias } =
  vi.hoisted(() => ({
    deleteManagedAlias: vi.fn(),
    requireSessionUserId: vi.fn(),
    updateManagedAlias: vi.fn(),
  }));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/manage-products", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/manage-products")>();

  return { ...actual, deleteManagedAlias, updateManagedAlias };
});

import { DELETE, PATCH } from "./route";

const userId = "user-a";
const productId = "22222222-2222-4222-8222-222222222222";
const aliasId = "33333333-3333-4333-8333-333333333333";
const targetProductId = "44444444-4444-4444-8444-444444444444";
const context = { params: Promise.resolve({ productId, aliasId }) };
const payload = { store: null, aisleSections: [], products: [] };

describe("product alias route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionUserId.mockResolvedValue(userId);
  });

  it("edits alias text and moves it to another personal product", async () => {
    updateManagedAlias.mockResolvedValue(payload);

    const response = await PATCH(
      new Request(
        `https://aisle-flow.example/api/products/${productId}/aliases/${aliasId}`,
        {
          body: JSON.stringify({
            displayText: "Jasmine rice",
            productConceptId: targetProductId,
          }),
          method: "PATCH",
        },
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(updateManagedAlias).toHaveBeenCalledWith(
      userId,
      productId,
      aliasId,
      {
        displayText: "Jasmine rice",
        productConceptId: targetProductId,
      },
    );
  });

  it("soft-deletes an alias", async () => {
    deleteManagedAlias.mockResolvedValue(payload);

    const response = await DELETE(
      new Request(
        `https://aisle-flow.example/api/products/${productId}/aliases/${aliasId}`,
        { method: "DELETE" },
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(deleteManagedAlias).toHaveBeenCalledWith(userId, productId, aliasId);
  });

  it("rejects invalid nested identifiers", async () => {
    const response = await DELETE(
      new Request("https://aisle-flow.example/api/products/bad/aliases/bad", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ productId: "bad", aliasId: "bad" }) },
    );

    expect(response.status).toBe(422);
    expect(deleteManagedAlias).not.toHaveBeenCalled();
  });
});
