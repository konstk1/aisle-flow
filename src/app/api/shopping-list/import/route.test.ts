import { beforeEach, describe, expect, it, vi } from "vitest";

const { hasValidSession, importActiveShoppingListItems } = vi.hoisted(() => ({
  hasValidSession: vi.fn(),
  importActiveShoppingListItems: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ hasValidSession }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    importActiveShoppingListItems,
  };
});

import { POST } from "./route";

const mutationId = "44444444-4444-4444-8444-444444444444";

function importRequest(body: unknown) {
  return new Request("https://aisle-flow.example/api/shopping-list/import", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

describe("shopping list import route", () => {
  beforeEach(() => {
    hasValidSession.mockResolvedValue(false);
    importActiveShoppingListItems.mockReset();
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
    hasValidSession.mockResolvedValue(true);

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
    hasValidSession.mockResolvedValue(true);
    importActiveShoppingListItems.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await POST(
      importRequest({ text: "Rice\nBroccoli", mutationId }),
    );

    expect(response.status).toBe(200);
    expect(importActiveShoppingListItems).toHaveBeenCalledWith({
      text: "Rice\nBroccoli",
      mutationId,
    });
  });
});
