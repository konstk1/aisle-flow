import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCompletedShoppingList, requireSessionUserId } = vi.hoisted(() => ({
  getCompletedShoppingList: vi.fn(),
  requireSessionUserId: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    getCompletedShoppingList,
  };
});

import { GET } from "./route";

const userId = "user-a";

describe("completed shopping list route", () => {
  beforeEach(() => {
    getCompletedShoppingList.mockReset();
    requireSessionUserId.mockReset();
    requireSessionUserId.mockResolvedValue(null);
  });

  it("rejects unauthenticated reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getCompletedShoppingList).not.toHaveBeenCalled();
  });

  it("returns completed items for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getCompletedShoppingList.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual" },
      items: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getCompletedShoppingList).toHaveBeenCalledWith(userId);
    await expect(response.json()).resolves.toEqual({
      completedList: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual" },
        items: [],
      },
    });
  });

  it("returns null when no shopping list exists yet", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getCompletedShoppingList.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      completedList: null,
    });
  });
});
