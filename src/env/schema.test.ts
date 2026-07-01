import { describe, expect, it } from "vitest";

import { getValidatedGitHubIssuesEnv, getValidatedServerEnv } from "./schema";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@example.com:5432/aisle_flow",
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "https://aisle-flow.example",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  ALLOWED_EMAILS: "kon.klitenik@gmail.com,friend@example.com",
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
        BETTER_AUTH_SECRET: "too-short",
      }),
    ).toThrow(/DATABASE_URL, BETTER_AUTH_SECRET/);
  });

  it("does not require a GitHub token for routes that do not report feedback", () => {
    const environmentWithoutToken: Partial<typeof validEnvironment> = {
      ...validEnvironment,
    };
    delete environmentWithoutToken.GITHUB_ISSUES_TOKEN;

    expect(getValidatedServerEnv(environmentWithoutToken)).toEqual(
      environmentWithoutToken,
    );
  });

  it("requires a GitHub token only when feedback reporting is enabled", () => {
    expect(() => getValidatedGitHubIssuesEnv({})).toThrow(
      /GITHUB_ISSUES_TOKEN/,
    );
  });
});
