import "server-only";

import { jwtVerify, SignJWT } from "jose";

import { getAuthEnv } from "./env";

export const SESSION_COOKIE_NAME = "__Host-aisle-flow-session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSessionKey() {
  return new TextEncoder().encode(getAuthEnv().SESSION_SECRET);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: true,
  };
}

export async function createSession() {
  return new SignJWT({ scope: "app" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionKey());
}

export async function verifySession(token: string | undefined) {
  if (!token) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionKey(), {
      algorithms: ["HS256"],
    });

    return payload.scope === "app";
  } catch {
    return false;
  }
}
