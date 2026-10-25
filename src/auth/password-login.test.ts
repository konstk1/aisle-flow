import { beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import {
  passwordLogin,
  passwordSessionFields,
  canManagePasswordFromLogin,
} from "./password-login";

const { allowed } = vi.hoisted(() => ({ allowed: { value: true } }));
vi.mock("./allowlist", () => ({ emailIsAllowed: () => allowed.value }));

beforeEach(() => {
  allowed.value = true;
});

async function setup() {
  const db = { user: [], account: [], session: [], verification: [] };
  const writePassword = vi.fn(async (userId: string, password: string) => {
    const ctx = await auth.$context;
    const credential = (await ctx.internalAdapter.findAccounts(userId)).find(
      (a) => a.providerId === "credential",
    );
    if (credential)
      await ctx.internalAdapter.updateAccount(credential.id, { password });
    else
      await ctx.internalAdapter.linkAccount({
        userId,
        accountId: userId,
        providerId: "credential",
        password,
      });
  });
  // A test-only login establishes the same server-owned session permission as
  // the Google callback. Requests below use actual signed session cookies.
  const testLogin: BetterAuthPlugin = {
    id: "test-login",
    endpoints: {
      testLogin: createAuthEndpoint(
        "/test-login",
        { method: "GET" },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.createUser({
            email: "owner@example.com",
            name: "Owner",
            emailVerified: true,
          });
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
            { canManagePassword: true },
            true,
          );
          await setSessionCookie(ctx, { user, session });
          return ctx.json({ userId: user.id });
        },
      ),
    },
  };
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-secret-long-enough-for-better-auth-85",
    database: memoryAdapter(db),
    advanced: { disableOriginCheck: false },
    logger: { disabled: true },
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { additionalFields: passwordSessionFields },
    plugins: [passwordLogin(writePassword), testLogin],
  });
  const request = (
    path: string,
    body?: unknown,
    cookie?: string,
    origin = "http://localhost:3000",
  ) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const response = await request("/test-login");
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const { userId } = await response.json();
  return { auth, request, cookie, userId, writePassword };
}

describe("password login", () => {
  it("sets and replaces the same user's credential, preserving existing sessions", async () => {
    const { auth, request, cookie, userId, writePassword } = await setup();
    expect(
      (
        await request(
          "/set-app-password",
          { newPassword: "first-password" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(writePassword.mock.calls[0][1]).not.toBe("first-password");
    const login = await request("/sign-in/email", {
      email: "owner@example.com",
      password: "first-password",
    });
    expect(login.status).toBe(200);
    expect((await login.json()).user.id).toBe(userId);
    const passwordCookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(
      (
        await request(
          "/set-app-password",
          { newPassword: "second-password" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/sign-in/email", {
          email: "owner@example.com",
          password: "first-password",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("/sign-in/email", {
          email: "owner@example.com",
          password: "second-password",
        })
      ).status,
    ).toBe(200);
    for (const existingCookie of [cookie, passwordCookie]) {
      const response = await request("/get-session", undefined, existingCookie);
      expect((await response.json()).user.id).toBe(userId);
    }
    expect(
      (await (await auth.$context).internalAdapter.findAccounts(userId)).filter(
        (a) => a.providerId === "credential",
      ),
    ).toHaveLength(1);
    expect(
      (
        await request(
          "/set-app-password",
          { newPassword: "unauthorized-change", canManagePassword: true },
          passwordCookie,
        )
      ).status,
    ).toBe(403);
  });

  it("rejects unauthenticated, non-allowlisted, cross-origin and invalid requests", async () => {
    const { request, cookie, writePassword } = await setup();
    expect(
      (await request("/set-app-password", { newPassword: "password-long" }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(
          "/set-app-password",
          { newPassword: "password-long" },
          cookie,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    for (const newPassword of ["short", "x".repeat(129)]) {
      expect(
        (await request("/set-app-password", { newPassword }, cookie)).status,
      ).toBe(400);
    }
    allowed.value = false;
    expect(
      (
        await request(
          "/set-app-password",
          { newPassword: "password-long" },
          cookie,
        )
      ).status,
    ).toBe(403);
    expect(writePassword).not.toHaveBeenCalled();
  });

  it("does not allow public password signup", async () => {
    const { request } = await setup();
    expect(
      (
        await request("/sign-up/email", {
          email: "new@example.com",
          password: "password-long",
          name: "New",
        })
      ).status,
    ).not.toBe(200);
  });

  it("grants password management only to Google callbacks or the enabled local login", () => {
    expect(canManagePasswordFromLogin("/callback/:id", "google", false)).toBe(
      true,
    );
    expect(
      canManagePasswordFromLogin("/oauth-proxy-callback", undefined, false),
    ).toBe(true);
    expect(canManagePasswordFromLogin("/callback/:id", "other", false)).toBe(
      false,
    );
    expect(canManagePasswordFromLogin("/sign-in/email", "google", false)).toBe(
      false,
    );
    expect(canManagePasswordFromLogin(undefined, undefined, false)).toBe(false);
    expect(canManagePasswordFromLogin("/dev-login", undefined, false)).toBe(
      false,
    );
    expect(canManagePasswordFromLogin("/dev-login", undefined, true)).toBe(
      true,
    );
  });
});
