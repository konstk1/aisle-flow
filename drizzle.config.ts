import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

import { parseDatabaseUrl } from "./src/env/schema";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: parseDatabaseUrl(process.env.DATABASE_URL),
  },
});
