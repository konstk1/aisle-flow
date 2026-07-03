import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSnoozedShoppingList, requireSessionUserId } = vi.hoisted(() => ({
  getSnoozedShoppingList: vi.fn(),
  requireSessionUserId: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    getSnoozedShoppingList,
  };
});

import { GET } from "./route";

const userId = "user-a";

describe("snoozed shopping list route", () => {
  beforeEach(() => {
    getSnoozedShoppingList.mockReset();
    requireSessionUserId.mockReset();
    requireSessionUserId.mockResolvedValue(null);
  });

  it("rejects unauthenticated reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getSnoozedShoppingList).not.toHaveBeenCalled();
  });

  it("returns snoozed items for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getSnoozedShoppingList.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual" },
      items: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getSnoozedShoppingList).toHaveBeenCalledWith(userId);
    await expect(response.json()).resolves.toEqual({
      snoozedList: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual" },
        items: [],
      },
    });
  });

  it("returns null when no shopping list exists yet", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    getSnoozedShoppingList.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snoozedList: null,
    });
  });
});
