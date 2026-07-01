import { beforeEach, describe, expect, it } from "vitest";

import { emailIsAllowed } from "./allowlist";

beforeEach(() => {
  // getAuthEnv() validates the full auth env subset, so every auth var must be
  // present for allowedEmails() to read ALLOWED_EMAILS.
  process.env.BETTER_AUTH_SECRET = "b".repeat(32);
  process.env.BETTER_AUTH_URL = "https://aisle-flow.example";
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  process.env.ALLOWED_EMAILS = "kon.klitenik@gmail.com, Friend@Example.com ";
});

describe("emailIsAllowed", () => {
  it("allows an email on the allowlist", () => {
    expect(emailIsAllowed("kon.klitenik@gmail.com")).toBe(true);
  });

  it("rejects an email that is not on the allowlist", () => {
    expect(emailIsAllowed("stranger@gmail.com")).toBe(false);
  });

  it("matches case-insensitively and tolerates whitespace in the allowlist", () => {
    // "Friend@Example.com " is stored with surrounding whitespace and mixed case.
    expect(emailIsAllowed("friend@example.com")).toBe(true);
    expect(emailIsAllowed("KON.Klitenik@Gmail.com")).toBe(true);
  });

  it("rejects a missing or empty email without throwing", () => {
    expect(emailIsAllowed(null)).toBe(false);
    expect(emailIsAllowed(undefined)).toBe(false);
    expect(emailIsAllowed("")).toBe(false);
  });

  it("drops blank allowlist entries so a trailing comma cannot allow an empty email", () => {
    process.env.ALLOWED_EMAILS = "a@example.com,, ,b@example.com,";

    expect(emailIsAllowed("a@example.com")).toBe(true);
    expect(emailIsAllowed("b@example.com")).toBe(true);
    expect(emailIsAllowed("")).toBe(false);
  });

  it("denies everyone when the allowlist has no usable entries", () => {
    process.env.ALLOWED_EMAILS = " , ,";

    expect(emailIsAllowed("kon.klitenik@gmail.com")).toBe(false);
  });
});
