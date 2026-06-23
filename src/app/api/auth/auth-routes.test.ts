import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME, verifySession } from "@/auth/session";

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";

const password = "correct horse battery staple";

function loginRequest(
  value: string,
  options: { accept?: string; clientId?: string; next?: string } = {},
) {
  const formData = new FormData();
  formData.set("password", value);
  formData.set("next", options.next ?? "/");

  return new Request("https://aisle-flow.example/api/auth/login", {
    body: formData,
    headers: {
      Accept: options.accept ?? "application/json",
      "X-Forwarded-For": options.clientId ?? "198.51.100.10",
    },
    method: "POST",
  });
}

function getCookieValue(setCookieHeader: string) {
  const match = setCookieHeader.match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
  );

  if (!match) {
    throw new Error("Expected a session cookie.");
  }

  return match[1];
}

beforeEach(async () => {
  process.env.APP_PASSWORD_HASH = await hash(password, 4);
  process.env.SESSION_SECRET = "s".repeat(32);
});

describe("login route", () => {
  it("creates only the expected secure session cookie after a successful login", async () => {
    const response = await login(
      loginRequest(password, { accept: "text/html", next: "/lists" }),
    );
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://aisle-flow.example/lists",
    );
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=604800");
    await expect(verifySession(getCookieValue(setCookie ?? ""))).resolves.toBe(
      true,
    );
  });

  it("returns a generic response without a session for invalid credentials", async () => {
    const response = await login(loginRequest("wrong password"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to sign in. Check your password and try again.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects external redirect destinations", async () => {
    const response = await login(
      loginRequest(password, { accept: "text/html", next: "/\\evil.example" }),
    );

    expect(response.headers.get("location")).toBe(
      "https://aisle-flow.example/",
    );
  });

  it("throttles repeated invalid attempts and permits a valid login after the window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    try {
      const clientId = "198.51.100.42";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(
          (await login(loginRequest("wrong password", { clientId }))).status,
        ).toBe(401);
      }

      const throttled = await login(
        loginRequest("wrong password", { clientId }),
      );
      expect(throttled.status).toBe(429);
      expect(throttled.headers.get("retry-after")).toBe("60");

      vi.advanceTimersByTime(60_000);

      expect((await login(loginRequest(password, { clientId }))).status).toBe(
        303,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("logout route", () => {
  it("expires the current session cookie", async () => {
    const response = await logout(
      new Request("https://aisle-flow.example/api/auth/logout", {
        headers: { Accept: "application/json" },
        method: "POST",
      }),
    );
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(204);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
  });
});
