import { beforeEach, describe, expect, it, vi } from "vitest";

const { getActiveShoppingList, requireSessionUserId } = vi.hoisted(() => ({
  getActiveShoppingList: vi.fn(),
  requireSessionUserId: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    getActiveShoppingList,
  };
});

import { ActiveShoppingListRequestError } from "@/services/active-shopping-list";

import * as shoppingListRoute from "./route";

const { GET } = shoppingListRoute;

const userId = "user-a";

describe("shopping list route", () => {
  beforeEach(() => {
    getActiveShoppingList.mockReset();
    requireSessionUserId.mockReset();
    requireSessionUserId.mockResolvedValue(null);
  });

  it("does not expose the legacy manual-addition endpoint", () => {
    expect("POST" in shoppingListRoute).toBe(false);
  });

  it("rejects unauthenticated reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getActiveShoppingList).not.toHaveBeenCalled();
  });

  it("returns the active list for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getActiveShoppingList.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual" },
      items: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getActiveShoppingList).toHaveBeenCalledWith(userId);
    await expect(response.json()).resolves.toEqual({
      activeList: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual" },
        items: [],
      },
    });
  });

  it("surfaces service-level list errors", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getActiveShoppingList.mockRejectedValue(
      new ActiveShoppingListRequestError(
        "Create and save a store layout before adding shopping items.",
        {
          form: [
            "Create and save a store layout before adding shopping items.",
          ],
        },
        409,
      ),
    );

    const response = await GET();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Create and save a store layout before adding shopping items.",
      fieldErrors: {
        form: ["Create and save a store layout before adding shopping items."],
      },
    });
  });
});
