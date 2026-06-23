import "server-only";

import { getServerEnv } from "@/env/server";

import { createDatabase } from "./create-client";

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  database ??= createDatabase(getServerEnv().DATABASE_URL);
  return database;
}
