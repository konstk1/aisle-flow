import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { getValidatedServerEnv } from "@/env/schema";

import { createDatabase } from "./create-client";

loadEnvConfig(process.cwd());

async function run() {
  const { DATABASE_URL } = getValidatedServerEnv(process.env);
  await migrate(createDatabase(DATABASE_URL), { migrationsFolder: "drizzle" });
  console.info("Database migrations applied.");
}

run().catch((error: unknown) => {
  console.error("Database migration failed.", error);
  process.exitCode = 1;
});
