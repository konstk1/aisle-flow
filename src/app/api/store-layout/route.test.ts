import { beforeEach, describe, expect, it, vi } from "vitest";

const { hasValidSession } = vi.hoisted(() => ({
  hasValidSession: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ hasValidSession }));
vi.mock("@/services/store-layout", () => ({
  getStoreLayout: vi.fn(),
  replaceStoreLayout: vi.fn(),
  StoreLayoutConflictError: class StoreLayoutConflictError extends Error {},
  storeLayoutSchema: { safeParse: vi.fn() },
}));

import { GET, PUT } from "./route";

describe("store layout route authorization", () => {
  beforeEach(() => {
    hasValidSession.mockResolvedValue(false);
  });

  it("rejects unauthenticated layout reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects unauthenticated layout updates before parsing the body", async () => {
    const response = await PUT(
      new Request("https://aisle-flow.example/api/store-layout", {
        body: "not json",
        method: "PUT",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
