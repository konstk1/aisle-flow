import { beforeEach, describe, expect, it, vi } from "vitest";

const { hasValidSession, requireSessionUserId } = vi.hoisted(() => ({
  hasValidSession: vi.fn(),
  requireSessionUserId: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ hasValidSession, requireSessionUserId }));
vi.mock("@/services/store-layout", () => ({
  getCurrentStoreLayout: vi.fn(),
  replaceStoreLayout: vi.fn(),
  storeLayoutSchema: { safeParse: vi.fn() },
}));

import { GET, PUT } from "./route";

describe("store layout route authorization", () => {
  beforeEach(() => {
    hasValidSession.mockResolvedValue(false);
    requireSessionUserId.mockResolvedValue(null);
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
