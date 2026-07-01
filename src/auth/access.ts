import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, emailIsAllowed } from "./better-auth";

export async function getServerSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!emailIsAllowed(session?.user.email)) {
    return null;
  }

  return session;
}

export async function requireSessionUserId() {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

export async function hasValidSession() {
  return (await requireSessionUserId()) !== null;
}

export async function requirePageSession() {
  const userId = await requireSessionUserId();

  if (!userId) {
    redirect("/login");
  }

  return userId;
}
