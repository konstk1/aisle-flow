import { hash } from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { createSession, SESSION_COOKIE_NAME } from "@/auth/session";

import { proxy } from "./proxy";

const password = "correct horse battery staple";

beforeEach(async () => {
  process.env.APP_PASSWORD_HASH = await hash(password, 4);
  process.env.SESSION_SECRET = "s".repeat(32);
});

describe("authentication proxy", () => {
  it("redirects unauthenticated page requests to login", async () => {
    const response = await proxy(
      new NextRequest("https://aisle-flow.example/lists?view=all"),
    );

    expect(response.headers.get("location")).toBe(
      "https://aisle-flow.example/login?next=%2Flists%3Fview%3Dall",
    );
  });

  it("rejects unauthenticated API requests", async () => {
    const response = await proxy(
      new NextRequest("https://aisle-flow.example/api/shopping-lists"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("allows the health endpoint without a session", async () => {
    const response = await proxy(
      new NextRequest("https://aisle-flow.example/api/health"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows signed sessions and keeps login out of an authenticated session", async () => {
    const session = await createSession();
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${session}` };

    const protectedResponse = await proxy(
      new NextRequest("https://aisle-flow.example/lists", { headers }),
    );
    const loginResponse = await proxy(
      new NextRequest("https://aisle-flow.example/login", { headers }),
    );

    expect(protectedResponse.headers.get("x-middleware-next")).toBe("1");
    expect(loginResponse.headers.get("location")).toBe(
      "https://aisle-flow.example/",
    );
  });
});
