import "server-only";

import { eq } from "drizzle-orm";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { user } from "@/db/schema";

import { emailIsAllowed } from "./allowlist";
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

export const auth = betterAuth({
  appName: "Aisle Flow",
  baseURL: getAuthEnv().BETTER_AUTH_URL,
  secret: getAuthEnv().BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    google: {
      clientId: getAuthEnv().GOOGLE_CLIENT_ID,
      clientSecret: getAuthEnv().GOOGLE_CLIENT_SECRET,
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
  },
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
  plugins: [nextCookies()],
});
