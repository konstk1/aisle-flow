import { loadEnvConfig } from "@next/env";

import { getValidatedServerEnv } from "@/env/schema";

import { createDatabase } from "./create-client";
import { seedCuratedProductCatalog } from "./product-catalog-seed";

loadEnvConfig(process.cwd());

async function run() {
  const { DATABASE_URL } = getValidatedServerEnv(process.env);
  await seedCuratedProductCatalog(createDatabase(DATABASE_URL));
  console.info("Curated product catalog seeded.");
}

run().catch((error: unknown) => {
  console.error("Curated product catalog seed failed.", error);
  process.exitCode = 1;
});
