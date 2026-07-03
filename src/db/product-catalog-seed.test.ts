import { describe, expect, it } from "vitest";

import { createDatabase } from "./create-client";
import {
  buildCuratedProductAliasSeedQuery,
  buildCuratedProductConceptSeedQuery,
} from "./product-catalog-seed";

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

  it("updates only conflicting global curated aliases", () => {
    const { sql: query, params } = buildCuratedProductAliasSeedQuery(database, [
      {
        productConceptId: "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
        normalizedText: "broccoli",
        scope: "global",
        confidence: 1,
        source: "curated",
        isCorrection: false,
      },
    ]).toSQL();

    expect(query).toContain(
      'on conflict ("normalized_text") where "product_aliases"."scope" = \'global\' do update set',
    );
    expect(query).toContain(
      '"product_concept_id" = excluded.product_concept_id',
    );
    expect(query).toContain('where "product_aliases"."source" = $8');
    expect(params).toEqual([
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "broccoli",
      "global",
      1,
      "curated",
      false,
      expect.any(String),
      "curated",
    ]);
  });
});
