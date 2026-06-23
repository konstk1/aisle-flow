import "server-only";

import { getValidatedServerEnv } from "./schema";

export function getServerEnv() {
  return getValidatedServerEnv(process.env);
}
