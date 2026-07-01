import "server-only";

import { getAuthEnv } from "./env";

function allowedEmails() {
  return new Set(
    getAuthEnv()
      .ALLOWED_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function emailIsAllowed(email: string | null | undefined) {
  return !!email && allowedEmails().has(email.toLowerCase());
}
