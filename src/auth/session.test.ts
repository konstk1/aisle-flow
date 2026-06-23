import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { verifyAppPassword } from "./password";
import {
  createSession,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifySession,
} from "./session";

const password = "correct horse battery staple";

beforeEach(async () => {
  process.env.APP_PASSWORD_HASH = await hash(password, 4);
  process.env.SESSION_SECRET = "s".repeat(32);
});

describe("application password verification", () => {
  it("accepts only the configured password", async () => {
    await expect(verifyAppPassword(password)).resolves.toBe(true);
    await expect(verifyAppPassword("incorrect password")).resolves.toBe(false);
    await expect(verifyAppPassword(null)).resolves.toBe(false);
  });
});

describe("sessions", () => {
  it("signs and verifies a short-lived application session", async () => {
    const session = await createSession();

    await expect(verifySession(session)).resolves.toBe(true);
    await expect(verifySession(`${session}tampered`)).resolves.toBe(false);
  });

  it("uses a host-only secure cookie", () => {
    expect(SESSION_COOKIE_NAME).toBe("__Host-aisle-flow-session");
    expect(getSessionCookieOptions()).toEqual({
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});
