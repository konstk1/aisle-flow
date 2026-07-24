import { describe, expect, it } from "vitest";

import { curatedProductConcepts } from "@/services/product-catalog";

import { createDatabase } from "./create-client";
import {
  buildCuratedProductAliasSeedQuery,
  buildCuratedProductConceptSeedQuery,
} from "./product-catalog-seed";

const database = createDatabase(
  "postgresql://user:password@localhost:5432/aisle_flow",
);
const userId = "user-a";

describe("personal product catalog seed queries", () => {
  it("inserts the complete code-owned catalog without overwriting personal changes", () => {
    const { sql: query, params } = buildCuratedProductConceptSeedQuery(
      database,
      userId,
    ).toSQL();

    expect(query).toContain('insert into "product_concepts"');
    expect(query).toContain("on conflict do nothing");
    expect(params.filter((param) => param === userId)).toHaveLength(
      curatedProductConcepts.length,
    );
  });

  it("materializes curated terms as user-owned seeded aliases", () => {
    const { sql: query, params } = buildCuratedProductAliasSeedQuery(
      database,
      userId,
    ).toSQL();
    const termCount = curatedProductConcepts.reduce(
      (total, concept) => total + concept.terms.length,
      0,
    );

    expect(query).toContain('insert into "product_aliases"');
    expect(query).toContain("on conflict do nothing");
    expect(
      params.filter((param) => param === userId).length,
    ).toBeGreaterThanOrEqual(termCount);
  });
});
