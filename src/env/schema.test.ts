import { describe, expect, it } from "vitest";

import { getValidatedServerEnv } from "./schema";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@example.com:5432/aisle_flow",
  APP_PASSWORD_HASH: "a".repeat(20),
  SESSION_SECRET: "b".repeat(32),
  GITHUB_ISSUES_TOKEN: "c".repeat(20),
};

describe("getValidatedServerEnv", () => {
  it("returns validated server-only variables", () => {
    expect(getValidatedServerEnv(validEnvironment)).toEqual(validEnvironment);
  });

  it("reports invalid variable names without echoing their values", () => {
    expect(() =>
      getValidatedServerEnv({
        ...validEnvironment,
        DATABASE_URL: "not-a-url",
        SESSION_SECRET: "too-short",
      }),
    ).toThrow(/DATABASE_URL, SESSION_SECRET/);
  });
});
