import "server-only";

import { eq } from "drizzle-orm";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { oAuthProxy } from "better-auth/plugins";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { user } from "@/db/schema";

import { emailIsAllowed } from "./allowlist";
import { devLogin, devLoginEnabled } from "./dev-login";
import { getAuthEnv } from "./env";

async function userIdIsAllowed(userId: string) {
  const [matchedUser] = await getDb()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return emailIsAllowed(matchedUser?.email);
}

function notAllowedError() {
  return APIError.from("FORBIDDEN", {
    code: "EMAIL_NOT_ALLOWED",
    message: "This Google account is not on the Aisle Flow guest list.",
  });
}

const authEnv = getAuthEnv();

// On Vercel preview deployments each build serves from its own URL. Better Auth
// must use that per-deployment URL as its base so the session cookie and the
// redirect back from the OAuth proxy target the actual preview host. Production
// and local development use the configured BETTER_AUTH_URL.
function resolveBaseURL() {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return authEnv.BETTER_AUTH_URL;
}

export const auth = betterAuth({
  appName: "Aisle Flow",
  baseURL: resolveBaseURL(),
  secret: authEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    google: {
      clientId: authEnv.GOOGLE_CLIENT_ID,
      clientSecret: authEnv.GOOGLE_CLIENT_SECRET,
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
  },
  trustedOrigins: [
    authEnv.BETTER_AUTH_URL,
    // Vercel preview deployments, e.g.
    // aisle-flow-git-<branch>-konsteam.vercel.app (and hash builds). Scoped to
    // this project + team rather than all of *.vercel.app.
    "https://aisle-flow-*-konsteam.vercel.app",
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          if (!emailIsAllowed(newUser.email)) {
            throw notAllowedError();
          }
        },
      },
    },
    session: {
      create: {
        before: async (newSession) => {
          if (!(await userIdIsAllowed(newSession.userId))) {
            throw notAllowedError();
          }
        },
      },
    },
  },
  plugins: [
    oAuthProxy({
      // Google's callback is registered only for the production URL; preview
      // deployments proxy the OAuth handshake through it and get redirected
      // back. productionURL equals baseURL on production and locally, so no
      // proxying happens there. The secret must match across every deployment
      // (BETTER_AUTH_SECRET is shared) so previews can decrypt the payload.
      productionURL: authEnv.BETTER_AUTH_URL,
      secret: authEnv.BETTER_AUTH_SECRET,
    }),
    // Local-only Google-OAuth bypass; never registered in production. See
    // dev-login.ts. Kept before nextCookies() so its session cookie is
    // forwarded onto the Next.js response.
    ...(devLoginEnabled() ? [devLogin()] : []),
    nextCookies(),
  ],
});
