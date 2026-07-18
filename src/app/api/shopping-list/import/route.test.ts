import { beforeEach, describe, expect, it, vi } from "vitest";

const { importActiveShoppingListItems, requireSessionUserId } = vi.hoisted(
  () => ({
    importActiveShoppingListItems: vi.fn(),
    requireSessionUserId: vi.fn(),
  }),
);

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    importActiveShoppingListItems,
  };
});

import { POST } from "./route";
import { ProductCategorizationUnavailableError } from "@/services/product-categorization";

const mutationId = "44444444-4444-4444-8444-444444444444";
const userId = "user-a";

function importRequest(body: unknown) {
  return new Request("https://aisle-flow.example/api/shopping-list/import", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

describe("shopping list import route", () => {
  beforeEach(() => {
    importActiveShoppingListItems.mockReset();
    requireSessionUserId.mockReset();
    requireSessionUserId.mockResolvedValue(null);
  });

  it("rejects unauthenticated imports before parsing the body", async () => {
    const response = await POST(
      new Request("https://aisle-flow.example/api/shopping-list/import", {
        body: "not json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(importActiveShoppingListItems).not.toHaveBeenCalled();
  });

  it("returns validation errors for invalid import envelopes", async () => {
    requireSessionUserId.mockResolvedValue(userId);

    const response = await POST(
      importRequest({ text: "Rice", mutationId: "bad-id" }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("Check the highlighted import field.");
    expect(body.fieldErrors).toEqual({
      mutationId: ["Provide a valid mutation id."],
    });
  });

  it("imports valid pasted text", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    importActiveShoppingListItems.mockResolvedValue({
      activeList: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual" },
        items: [],
      },
      alreadyOnList: [],
      updatedQuantities: [],
    });

    const response = await POST(
      importRequest({ text: "Rice\nBroccoli", mutationId }),
    );

    expect(response.status).toBe(200);
    expect(importActiveShoppingListItems).toHaveBeenCalledWith(userId, {
      text: "Rice\nBroccoli",
      mutationId,
      categorizationMode: "ai",
    });
    await expect(response.json()).resolves.toMatchObject({
      alreadyOnList: [],
      activeList: { items: [] },
    });
  });

  it("returns the retryable AI recovery contract", async () => {
    requireSessionUserId.mockResolvedValue(userId);
    importActiveShoppingListItems.mockRejectedValue(
      new ProductCategorizationUnavailableError(),
    );

    const response = await POST(importRequest({ text: "Rice", mutationId }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "AI_CATEGORIZATION_UNAVAILABLE",
      error: "The items could not be categorized.",
      retryable: true,
    });
  });
});
