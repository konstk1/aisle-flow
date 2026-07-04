import "server-only";

import { APIError, type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

import { emailIsAllowed } from "./allowlist";
import { getAuthEnv } from "./env";
import { getSafeRedirectPath } from "./redirect";

// A password-free sign-in shortcut for local development so tools that can't
// complete Google's OAuth redirect (e.g. the in-editor preview browser) can
// still reach the authenticated app. It mints a real Better Auth session for an
// allowlisted account, so every downstream guard behaves exactly as in
// production — nothing here mocks or weakens auth.
//
// This is wired in only when `devLoginEnabled()` is true (see better-auth.ts).
// It is triple-gated so that any single guard is sufficient to keep the endpoint
// out of every deployed environment; it exists only on a local machine that has
// explicitly opted in:
//   - NODE_ENV !== "production": Vercel builds every deployment (production AND
//     preview) with `next build`, which forces NODE_ENV="production". Only a
//     local `next dev` is "development".
//   - !VERCEL: Vercel sets VERCEL=1 on all deployments; a plain local dev server
//     never has it. Blocks previews even if NODE_ENV were somehow overridden.
//   - ENABLE_DEV_LOGIN === "true": explicit opt-in, off by default.
export function devLoginEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    process.env.ENABLE_DEV_LOGIN === "true"
  );
}

function defaultDevEmail() {
  return getAuthEnv()
    .ALLOWED_EMAILS.split(",")
    .map((email) => email.trim())
    .filter(Boolean)[0]
    ?.toLowerCase();
}

function displayNameFor(email: string) {
  return `Dev (${email.split("@")[0]})`;
}

const devLoginQuerySchema = z.object({
  // Which allowlisted account to sign in as; defaults to the first entry in
  // ALLOWED_EMAILS when omitted.
  email: z.string().optional(),
  // Where to land after sign-in; sanitized to a same-origin path.
  callbackURL: z.string().optional(),
});

export function devLogin(): BetterAuthPlugin {
  return {
    id: "dev-login",
    endpoints: {
      devLogin: createAuthEndpoint(
        "/dev-login",
        { method: "GET", query: devLoginQuerySchema },
        async (ctx) => {
          // Defense in depth: the plugin is only registered when enabled, but
          // refuse anyway if the guard is ever false at request time.
          if (!devLoginEnabled()) {
            throw APIError.from("NOT_FOUND", {
              code: "NOT_FOUND",
              message: "Not found.",
            });
          }

          const email =
            ctx.query?.email?.trim().toLowerCase() || defaultDevEmail();

          if (!emailIsAllowed(email)) {
            throw APIError.from("FORBIDDEN", {
              code: "EMAIL_NOT_ALLOWED",
              message: `"${email ?? ""}" is not in ALLOWED_EMAILS.`,
            });
          }

          let user = await ctx.context.internalAdapter
            .findUserByEmail(email)
            .then((result) => result?.user);

          if (!user) {
            user = await ctx.context.internalAdapter.createUser({
              email,
              emailVerified: true,
              name: displayNameFor(email),
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );

          await setSessionCookie(ctx, { session, user });

          throw ctx.redirect(getSafeRedirectPath(ctx.query?.callbackURL));
        },
      ),
    },
  };
}
