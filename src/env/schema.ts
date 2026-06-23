import { z } from "zod";

const databaseUrlSchema = z.string().url();

export const serverEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  APP_PASSWORD_HASH: z.string().min(20),
  SESSION_SECRET: z.string().min(32),
  GITHUB_ISSUES_TOKEN: z.string().min(20),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const authEnvSchema = serverEnvSchema.pick({
  APP_PASSWORD_HASH: true,
  SESSION_SECRET: true,
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

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
