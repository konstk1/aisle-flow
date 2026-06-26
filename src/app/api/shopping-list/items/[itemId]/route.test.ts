import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteActiveShoppingItem,
  hasValidSession,
  setActiveShoppingItemChecked,
  updateActiveShoppingItemText,
} = vi.hoisted(() => ({
  deleteActiveShoppingItem: vi.fn(),
  hasValidSession: vi.fn(),
  setActiveShoppingItemChecked: vi.fn(),
  updateActiveShoppingItemText: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ hasValidSession }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    deleteActiveShoppingItem,
    setActiveShoppingItemChecked,
    updateActiveShoppingItemText,
  };
});

import { DELETE, PATCH } from "./route";

const itemId = "33333333-3333-4333-8333-333333333333";

function checkRequest(body: unknown) {
  return new Request(
    `https://aisle-flow.example/api/shopping-list/items/${itemId}`,
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

function params(id = itemId) {
  return { params: Promise.resolve({ itemId: id }) };
}

describe("shopping list item route", () => {
  beforeEach(() => {
    hasValidSession.mockResolvedValue(false);
    deleteActiveShoppingItem.mockReset();
    setActiveShoppingItemChecked.mockReset();
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
    hasValidSession.mockResolvedValue(true);

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
    hasValidSession.mockResolvedValue(true);

    const response = await PATCH(checkRequest({ isChecked: "yes" }), params());

    expect(response.status).toBe(422);
    expect(setActiveShoppingItemChecked).not.toHaveBeenCalled();
  });

  it("returns validation errors for ambiguous item updates", async () => {
    hasValidSession.mockResolvedValue(true);

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
    hasValidSession.mockResolvedValue(true);
    setActiveShoppingItemChecked.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await PATCH(checkRequest({ isChecked: true }), params());

    expect(response.status).toBe(200);
    expect(setActiveShoppingItemChecked).toHaveBeenCalledWith({
      itemId,
      isChecked: true,
    });
  });

  it("updates item text for authenticated callers", async () => {
    hasValidSession.mockResolvedValue(true);
    updateActiveShoppingItemText.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await PATCH(checkRequest({ text: "Wild Rice" }), params());

    expect(response.status).toBe(200);
    expect(updateActiveShoppingItemText).toHaveBeenCalledWith({
      itemId,
      text: "Wild Rice",
    });
    expect(setActiveShoppingItemChecked).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated deletes", async () => {
    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(deleteActiveShoppingItem).not.toHaveBeenCalled();
  });

  it("deletes an item for authenticated callers", async () => {
    hasValidSession.mockResolvedValue(true);
    deleteActiveShoppingItem.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(200);
    expect(deleteActiveShoppingItem).toHaveBeenCalledWith({ itemId });
  });
});
