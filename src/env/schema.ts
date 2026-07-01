import { z } from "zod";

const databaseUrlSchema = z.string().url();

export const serverEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ALLOWED_EMAILS: z.string().min(1),
  GITHUB_ISSUES_TOKEN: z.string().min(20).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const authEnvSchema = serverEnvSchema.pick({
  BETTER_AUTH_SECRET: true,
  BETTER_AUTH_URL: true,
  GOOGLE_CLIENT_ID: true,
  GOOGLE_CLIENT_SECRET: true,
  ALLOWED_EMAILS: true,
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

export const githubIssuesEnvSchema = z.object({
  GITHUB_ISSUES_TOKEN: z.string().min(20),
});

export type GitHubIssuesEnv = z.infer<typeof githubIssuesEnvSchema>;

export function parseDatabaseUrl(value: unknown): string {
  const result = databaseUrlSchema.safeParse(value);

  if (!result.success) {
    throw new Error(
      "Invalid server environment: DATABASE_URL must be a valid PostgreSQL connection URL.",
    );
  }

  return result.data;
}

export function getValidatedServerEnv(input: unknown): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    const invalidKeys = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];

    throw new Error(
      `Invalid server environment: ${invalidKeys.join(", ")}. Update the required server variables before continuing.`,
    );
  }

  return result.data;
}

export function getValidatedAuthEnv(input: unknown): AuthEnv {
  const result = authEnvSchema.safeParse(input);

  if (!result.success) {
    const invalidKeys = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];

    throw new Error(
      `Invalid authentication environment: ${invalidKeys.join(", ")}. Update the required server variables before continuing.`,
    );
  }

  return result.data;
}

export function getValidatedGitHubIssuesEnv(input: unknown): GitHubIssuesEnv {
  const result = githubIssuesEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error(
      "Invalid feedback environment: GITHUB_ISSUES_TOKEN. Configure it before enabling in-app issue reporting.",
    );
  }

  return result.data;
}
