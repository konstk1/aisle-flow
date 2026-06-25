import { beforeEach, describe, expect, it, vi } from "vitest";

const { addActiveShoppingListItem, getActiveShoppingList, hasValidSession } =
  vi.hoisted(() => ({
    addActiveShoppingListItem: vi.fn(),
    getActiveShoppingList: vi.fn(),
    hasValidSession: vi.fn(),
  }));

vi.mock("@/auth/access", () => ({ hasValidSession }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    addActiveShoppingListItem,
    getActiveShoppingList,
  };
});

import { ActiveShoppingListRequestError } from "@/services/active-shopping-list";

import { GET, POST } from "./route";

const mutationId = "44444444-4444-4444-8444-444444444444";

function itemRequest(body: unknown) {
  return new Request("https://aisle-flow.example/api/shopping-list", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

describe("shopping list route", () => {
  beforeEach(() => {
    addActiveShoppingListItem.mockReset();
    getActiveShoppingList.mockReset();
    hasValidSession.mockResolvedValue(false);
  });

  it("rejects unauthenticated reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getActiveShoppingList).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated additions before parsing the body", async () => {
    const response = await POST(
      new Request("https://aisle-flow.example/api/shopping-list", {
        body: "not json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(addActiveShoppingListItem).not.toHaveBeenCalled();
  });

  it("returns the active list for authenticated callers", async () => {
    hasValidSession.mockResolvedValue(true);
    getActiveShoppingList.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      activeList: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual", syncState: "synced" },
        items: [],
      },
    });
  });

  it("returns field errors for invalid manual additions", async () => {
    hasValidSession.mockResolvedValue(true);

    const response = await POST(
      itemRequest({ text: "   ", mutationId: "not-a-uuid" }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("Check the highlighted item fields.");
    expect(body.fieldErrors).toEqual(
      expect.objectContaining({
        text: ["Enter an item with letters or numbers."],
        mutationId: ["Provide a valid mutation id."],
      }),
    );
    expect(addActiveShoppingListItem).not.toHaveBeenCalled();
  });

  it("adds a valid manual item", async () => {
    hasValidSession.mockResolvedValue(true);
    addActiveShoppingListItem.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await POST(itemRequest({ text: "  Rice  ", mutationId }));

    expect(response.status).toBe(200);
    expect(addActiveShoppingListItem).toHaveBeenCalledWith({
      text: "Rice",
      mutationId,
    });
  });

  it("surfaces service-level list errors", async () => {
    hasValidSession.mockResolvedValue(true);
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
