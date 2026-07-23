import { beforeEach, describe, expect, it, vi } from "vitest";

const { copyStoreRoute, requireSessionUserId } = vi.hoisted(() => ({
  copyStoreRoute: vi.fn(),
  requireSessionUserId: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ requireSessionUserId }));
vi.mock("@/services/store-layout", () => ({ copyStoreRoute }));

import { POST } from "./route";

const sourceStoreId = "11111111-1111-4111-8111-111111111111";
const copiedStore = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Example Market copy",
};

function copyRequest(body: unknown) {
  return new Request(
    `https://aisle-flow.example/api/stores/${sourceStoreId}/copy`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function routeContext(storeId = sourceStoreId) {
  return { params: Promise.resolve({ storeId }) };
}

describe("copy store route", () => {
  beforeEach(() => {
    copyStoreRoute.mockReset();
    requireSessionUserId.mockReset();
    requireSessionUserId.mockResolvedValue("user-1");
  });

  it("rejects unauthenticated copies before parsing the body", async () => {
    requireSessionUserId.mockResolvedValue(null);

    const response = await POST(
      new Request("https://aisle-flow.example/api/stores/source/copy", {
        body: "not json",
        method: "POST",
      }),
      routeContext("not-a-uuid"),
    );

    expect(response.status).toBe(401);
    expect(copyStoreRoute).not.toHaveBeenCalled();
  });

  it("validates the source store id", async () => {
    const response = await POST(
      copyRequest({ name: copiedStore.name }),
      routeContext("invalid"),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Choose a valid store.",
      fieldErrors: { sourceStoreId: ["Choose a valid store."] },
    });
    expect(copyStoreRoute).not.toHaveBeenCalled();
  });

  it("validates and normalizes the new store name", async () => {
    copyStoreRoute.mockResolvedValue(copiedStore);

    const response = await POST(
      copyRequest({ name: `  ${copiedStore.name}  ` }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(copyStoreRoute).toHaveBeenCalledWith(
      sourceStoreId,
      copiedStore.name,
      "user-1",
    );
    await expect(response.json()).resolves.toEqual({ store: copiedStore });
  });

  it("does not create a copy with a blank name", async () => {
    const response = await POST(copyRequest({ name: "   " }), routeContext());

    expect(response.status).toBe(422);
    expect(copyStoreRoute).not.toHaveBeenCalled();
  });
});
