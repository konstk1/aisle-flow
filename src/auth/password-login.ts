import "server-only";

import { randomUUID } from "node:crypto";
import { APIError, type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { z } from "zod";

import { getDb } from "@/db/client";
import { account } from "@/db/schema";
import { emailIsAllowed } from "./allowlist";

export const passwordSessionFields = {
  canManagePassword: { type: "boolean", defaultValue: false, input: false },
} as const;

export function canManagePasswordFromLogin(
  path: string | undefined,
  provider: string | undefined,
  developmentLoginEnabled: boolean,
) {
  return (
    (path === "/callback/:id" && provider === "google") ||
    // Google is the only configured OAuth provider; this callback verifies
    // the encrypted profile and OAuth state before creating the session.
    path === "/oauth-proxy-callback" ||
    (developmentLoginEnabled && path === "/dev-login")
  );
}

async function savePassword(userId: string, password: string) {
  await getDb()
    .insert(account)
    .values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password,
    })
    .onConflictDoUpdate({
      target: [account.providerId, account.accountId],
      set: { password, updatedAt: new Date() },
    });
}

export function passwordLogin(writePassword = savePassword): BetterAuthPlugin {
  return {
    id: "password-login",
    endpoints: {
      setAppPassword: createAuthEndpoint(
        "/set-app-password",
        {
          method: "POST",
          body: z.object({ newPassword: z.string().min(8).max(128) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          if (!emailIsAllowed(user.email)) {
            throw APIError.from("FORBIDDEN", {
              code: "EMAIL_NOT_ALLOWED",
              message: "This account is not on the guest list.",
            });
          }
          if (
            !(session as typeof session & { canManagePassword?: boolean })
              .canManagePassword
          ) {
            throw APIError.from("FORBIDDEN", {
              code: "GOOGLE_SIGN_IN_REQUIRED",
              message: "Sign in with Google to set your password.",
            });
          }
          await writePassword(
            user.id,
            await ctx.context.password.hash(ctx.body.newPassword),
          );
          return ctx.json({ status: true });
        },
      ),
    },
  };
}
