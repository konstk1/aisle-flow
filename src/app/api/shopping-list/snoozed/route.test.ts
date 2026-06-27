import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSnoozedShoppingList, hasValidSession } = vi.hoisted(() => ({
  getSnoozedShoppingList: vi.fn(),
  hasValidSession: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ hasValidSession }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    getSnoozedShoppingList,
  };
});

import { GET } from "./route";

describe("snoozed shopping list route", () => {
  beforeEach(() => {
    getSnoozedShoppingList.mockReset();
    hasValidSession.mockResolvedValue(false);
  });

  it("rejects unauthenticated reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getSnoozedShoppingList).not.toHaveBeenCalled();
  });

  it("returns snoozed items for authenticated callers", async () => {
    hasValidSession.mockResolvedValue(true);
    getSnoozedShoppingList.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snoozedList: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual", syncState: "synced" },
        items: [],
      },
    });
  });

  it("returns null when no shopping list exists yet", async () => {
    hasValidSession.mockResolvedValue(true);
    getSnoozedShoppingList.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snoozedList: null,
    });
  });
});
