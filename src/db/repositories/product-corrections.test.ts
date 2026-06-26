import { describe, expect, it } from "vitest";

import { createDatabase } from "../create-client";
import {
  buildManualProductAliasCorrectionQuery,
  buildManualProductLocationCorrectionQuery,
  buildProductConceptCreateQuery,
  productConceptIdByNormalizedName,
} from "./product-corrections";

const database = createDatabase(
  "postgresql://user:password@localhost:5432/aisle_flow",
);

const now = new Date("2026-01-01T00:00:00Z");
const storeId = "11111111-1111-4111-8111-111111111111";
const productConceptId = "22222222-2222-4222-8222-222222222222";
const aisleSectionId = "33333333-3333-4333-8333-333333333333";

describe("product correction queries", () => {
  it("returns a category when normalized concept creation conflicts", () => {
    const { sql: query, params } = buildProductConceptCreateQuery(database, {
      canonicalName: "bulk grains",
      normalizedName: "bulk grains",
    }).toSQL();

    expect(query).toContain('insert into "product_concepts"');
    expect(query).toContain(
      'on conflict ("normalized_name") do update set "canonical_name" = "product_concepts"."canonical_name"',
    );
    expect(query).toContain("returning");
    expect(params).toEqual(["bulk grains", "bulk grains", "{}"]);
  });

  it("upserts an exact learned store alias for later precedence", () => {
    const { sql: query, params } = buildManualProductAliasCorrectionQuery(
      database,
      {
        storeId,
        productConceptId,
        normalizedText: "wild rice",
        now,
      },
    ).toSQL();

    expect(query).toContain('insert into "product_aliases"');
    expect(query).toContain(
      'on conflict ("store_id","normalized_text") where "product_aliases"."scope" = \'store\' do update set',
    );
    expect(query).toContain(
      '"product_concept_id" = excluded.product_concept_id',
    );
    expect(query).toContain('"confidence" = excluded.confidence');
    expect(query).toContain('"source" = excluded.source');
    expect(query).toContain('"is_correction" = excluded.is_correction');
    expect(query).toContain("returning");
    expect(params).toEqual([
      productConceptId,
      storeId,
      "wild rice",
      "store",
      1,
      "learned",
      true,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("can upsert a learned alias for a concept created earlier in the same batch", () => {
    const { sql: query, params } = buildManualProductAliasCorrectionQuery(
      database,
      {
        storeId,
        productConceptId: productConceptIdByNormalizedName("dried fruit"),
        normalizedText: "dried mango",
        now,
      },
    ).toSQL();

    expect(query).toContain(
      '(select "product_concepts"."id" from "product_concepts" where "product_concepts"."normalized_name" = $1 limit 1)',
    );
    expect(query).toContain(
      '"product_concept_id" = excluded.product_concept_id',
    );
    expect(params).toEqual([
      "dried fruit",
      storeId,
      "dried mango",
      "store",
      1,
      "learned",
      true,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("updates the one store-specific product location for a category without clobbering existing section position", () => {
    const { sql: query, params } = buildManualProductLocationCorrectionQuery(
      database,
      {
        storeId,
        productConceptId,
        aisleSectionId,
        positionWithinSection: 2,
        now,
      },
    ).toSQL();

    expect(query).toContain('insert into "product_locations"');
    expect(query).toContain(
      'on conflict ("store_id","product_concept_id") do update set',
    );
    expect(query).toContain('"aisle_section_id" = excluded.aisle_section_id');
    expect(query).not.toContain(
      '"position_within_section" = excluded.position_within_section',
    );
    expect(query).toContain('"source" = excluded.source');
    expect(query).toContain('"version" = "product_locations"."version" + 1');
    expect(query).toContain("returning");
    expect(params).toEqual([
      storeId,
      productConceptId,
      aisleSectionId,
      2,
      1,
      "manual",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });
});
