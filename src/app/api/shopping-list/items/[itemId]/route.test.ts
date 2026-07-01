import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteActiveShoppingItem,
  requireSessionUserId,
  setActiveShoppingItemChecked,
  snoozeActiveShoppingItem,
  updateActiveShoppingItemText,
} = vi.hoisted(() => ({
  deleteActiveShoppingItem: vi.fn(),
  requireSessionUserId: vi.fn(),
  setActiveShoppingItemChecked: vi.fn(),
  snoozeActiveShoppingItem: vi.fn(),
  updateActiveShoppingItemText: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    deleteActiveShoppingItem,
    setActiveShoppingItemChecked,
    snoozeActiveShoppingItem,
    updateActiveShoppingItemText,
  };
});

import { DELETE, PATCH } from "./route";

const itemId = "33333333-3333-4333-8333-333333333333";
const userId = "user-a";

function checkRequest(body: unknown) {
  return new Request(
    `https://aisle-flow.example/api/shopping-list/items/${itemId}`,
    {
      body: JSON.stringify(body),
      method: "PATCH",
    },
  );
}

function completedCheckRequest(body: unknown) {
  return new Request(
    `https://aisle-flow.example/api/shopping-list/items/${itemId}?view=completed`,
    {
      body: JSON.stringify(body),
      method: "PATCH",
    },
  );
}

function completedTextRequest(body: unknown) {
  return new Request(
    `https://aisle-flow.example/api/shopping-list/items/${itemId}?view=completed`,
    {
      body: JSON.stringify(body),
      method: "PATCH",
    },
  );
}

function snoozedPatchRequest(body: unknown) {
  return new Request(
    `https://aisle-flow.example/api/shopping-list/items/${itemId}?view=snoozed`,
    {
      body: JSON.stringify(body),
      method: "PATCH",
    },
  );
}

function deleteRequest() {
  return new Request(
    `https://aisle-flow.example/api/shopping-list/items/${itemId}`,
    { method: "DELETE" },
  );
}

function completedDeleteRequest() {
  return new Request(
    `https://aisle-flow.example/api/shopping-list/items/${itemId}?view=completed`,
    { method: "DELETE" },
  );
}

function params(id = itemId) {
  return { params: Promise.resolve({ itemId: id }) };
}

describe("shopping list item route", () => {
  beforeEach(() => {
    deleteActiveShoppingItem.mockReset();
    requireSessionUserId.mockReset();
    requireSessionUserId.mockResolvedValue(null);
    setActiveShoppingItemChecked.mockReset();
    snoozeActiveShoppingItem.mockReset();
    updateActiveShoppingItemText.mockReset();
  });

  it("rejects unauthenticated check updates before parsing the body", async () => {
    const response = await PATCH(
      new Request(
        `https://aisle-flow.example/api/shopping-list/items/${itemId}`,
        {
          body: "not json",
          method: "PATCH",
        },
      ),
      params(),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(setActiveShoppingItemChecked).not.toHaveBeenCalled();
  });

  it("returns validation errors for invalid item ids", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await PATCH(
      checkRequest({ isChecked: true }),
      params("bad"),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Choose a valid shopping-list item.",
      fieldErrors: { itemId: ["Choose a valid shopping-list item."] },
    });
  });

  it("returns validation errors for invalid checked state", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await PATCH(checkRequest({ isChecked: "yes" }), params());

    expect(response.status).toBe(422);
    expect(setActiveShoppingItemChecked).not.toHaveBeenCalled();
  });

  it("returns validation errors for ambiguous item updates", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await PATCH(
      checkRequest({ isChecked: true, text: "Rice" }),
      params(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Check the highlighted item fields.",
      fieldErrors: { form: ["Send exactly one item update."] },
    });
    expect(setActiveShoppingItemChecked).not.toHaveBeenCalled();
    expect(updateActiveShoppingItemText).not.toHaveBeenCalled();
  });

  it("updates checked state for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    setActiveShoppingItemChecked.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await PATCH(checkRequest({ isChecked: true }), params());

    expect(response.status).toBe(200);
    expect(setActiveShoppingItemChecked).toHaveBeenCalledWith({
      userId,
      itemId,
      isChecked: true,
      responseView: "active",
    });
  });

  it("returns the list for completed-screen check updates", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    setActiveShoppingItemChecked.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await PATCH(
      completedCheckRequest({ isChecked: false }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(setActiveShoppingItemChecked).toHaveBeenCalledWith({
      userId,
      itemId,
      isChecked: false,
      responseView: "completed",
    });
    await expect(response.json()).resolves.toEqual({
      list: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual", syncState: "synced" },
        items: [],
      },
    });
  });

  it("snoozes an item for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    snoozeActiveShoppingItem.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await PATCH(
      snoozedPatchRequest({ snoozed: true }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(snoozeActiveShoppingItem).toHaveBeenCalledWith({
      userId,
      itemId,
      responseView: "snoozed",
      snoozed: true,
    });
    expect(setActiveShoppingItemChecked).not.toHaveBeenCalled();
  });

  it("updates item text for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    updateActiveShoppingItemText.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await PATCH(checkRequest({ text: "Wild Rice" }), params());

    expect(response.status).toBe(200);
    expect(updateActiveShoppingItemText).toHaveBeenCalledWith({
      userId,
      itemId,
      responseView: "active",
      text: "Wild Rice",
    });
    expect(setActiveShoppingItemChecked).not.toHaveBeenCalled();
  });

  it("returns the list for completed-screen text updates", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    updateActiveShoppingItemText.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await PATCH(
      completedTextRequest({ text: "Wild Rice" }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(updateActiveShoppingItemText).toHaveBeenCalledWith({
      userId,
      itemId,
      responseView: "completed",
      text: "Wild Rice",
    });
    await expect(response.json()).resolves.toEqual({
      list: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual", syncState: "synced" },
        items: [],
      },
    });
  });

  it("rejects unauthenticated deletes", async () => {
    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(deleteActiveShoppingItem).not.toHaveBeenCalled();
  });

  it("deletes an item for authenticated callers", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    deleteActiveShoppingItem.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(200);
    expect(deleteActiveShoppingItem).toHaveBeenCalledWith({
      userId,
      itemId,
      responseView: "active",
    });
  });

  it("returns the list for completed-screen deletes", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    deleteActiveShoppingItem.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await DELETE(completedDeleteRequest(), params());

    expect(response.status).toBe(200);
    expect(deleteActiveShoppingItem).toHaveBeenCalledWith({
      userId,
      itemId,
      responseView: "completed",
    });
    await expect(response.json()).resolves.toEqual({
      list: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual", syncState: "synced" },
        items: [],
      },
    });
  });
});
