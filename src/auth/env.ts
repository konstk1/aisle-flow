import "server-only";

import { getValidatedAuthEnv } from "@/env/schema";

export function getAuthEnv() {
  return getValidatedAuthEnv(process.env);
}
