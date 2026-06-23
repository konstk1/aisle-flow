import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME, verifySession } from "./session";

export async function hasValidSession() {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  return verifySession(session);
}

export async function requirePageSession() {
  if (!(await hasValidSession())) {
    redirect("/login");
  }
}

export async function requireApiSession() {
  return hasValidSession();
}
