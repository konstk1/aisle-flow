import { describe, expect, it } from "vitest";

import { createDatabase } from "./create-client";
import { buildCuratedProductConceptSeedQuery } from "./product-catalog-seed";

const database = createDatabase(
  "postgresql://user:password@localhost:5432/aisle_flow",
);

describe("curated product catalog seed queries", () => {
  it("updates product concept metadata when the curated seed is rerun", () => {
    const { sql: query } =
      buildCuratedProductConceptSeedQuery(database).toSQL();

    expect(query).toContain('on conflict ("normalized_name") do update set');
    expect(query).toContain('"canonical_name" = excluded.canonical_name');
    expect(query).toContain('"excluded_terms" = excluded.excluded_terms');
  });

  it("contains the complete code-owned catalog and no alias writes", () => {
    const { sql: query, params } =
      buildCuratedProductConceptSeedQuery(database).toSQL();

    expect(params).toHaveLength(30 * 3 + 1);
    expect(query).toContain('insert into "product_concepts"');
    expect(query).not.toContain("product_aliases");
  });
});
