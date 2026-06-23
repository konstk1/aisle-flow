import "server-only";

import { compare } from "bcryptjs";

import { getAuthEnv } from "./env";

export async function verifyAppPassword(password: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0) {
    return false;
  }

  return compare(password, getAuthEnv().APP_PASSWORD_HASH);
}
