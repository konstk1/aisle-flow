import { describe, expect, it } from "vitest";

import { createDatabase } from "../create-client";
import {
  buildLearnedAliasDeleteQuery,
  buildLearnedAliasListQuery,
  buildManualProductAliasCorrectionQuery,
  buildManualProductLocationCorrectionQuery,
  buildProductConceptCreateQuery,
  buildProductConceptListQuery,
  buildProductLearningEventInsertQuery,
  buildProductLearningEventListQuery,
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
  it("lists concepts with their location in the given store", () => {
    const { sql: query, params } = buildProductConceptListQuery(
      database,
      storeId,
    ).toSQL();

    expect(query).toContain('from "product_concepts"');
    expect(query).toContain('left join "product_locations"');
    expect(query).toContain('"product_locations"."store_id" = $');
    expect(query).toContain(
      'order by "product_concepts"."normalized_name" asc',
    );
    expect(params).toEqual([storeId]);
  });

  it("lists concepts without locations when no store is selected", () => {
    const { sql: query, params } = buildProductConceptListQuery(
      database,
      null,
    ).toSQL();

    expect(query).toContain('left join "product_locations"');
    expect(query).toContain("false");
    expect(query).not.toContain('"product_locations"."store_id" = $');
    expect(params).toEqual([]);
  });

  it("returns a concept when normalized concept creation conflicts", () => {
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

  it("updates the one store-specific product location for a concept without clobbering existing section position", () => {
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

  it("lists only learned correction aliases for the store with their locations", () => {
    const { sql: query, params } = buildLearnedAliasListQuery(
      database,
      storeId,
    ).toSQL();

    expect(query).toContain('from "product_aliases"');
    expect(query).toContain('inner join "product_concepts"');
    expect(query).toContain('left join "product_locations"');
    expect(query).toContain('left join "aisle_sections"');
    expect(query).toContain('left join "aisles"');
    expect(query).toContain('"product_aliases"."source" = $');
    expect(query).toContain('"product_aliases"."is_correction" = $');
    expect(query).toContain('order by "product_aliases"."updated_at" desc');
    expect(params).toContain(storeId);
    expect(params).toContain("learned");
    expect(params).toContain(true);
  });

  it("deletes an alias only when it is a learned correction", () => {
    const { sql: query, params } = buildLearnedAliasDeleteQuery(
      database,
      "44444444-4444-4444-8444-444444444444",
    ).toSQL();

    expect(query).toContain('delete from "product_aliases"');
    expect(query).toContain('"product_aliases"."source" = $');
    expect(query).toContain('"product_aliases"."is_correction" = $');
    expect(query).toContain("returning");
    expect(params).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "learned",
      true,
    ]);
  });

  it("inserts learning events with actor and display snapshots", () => {
    const { sql: query, params } = buildProductLearningEventInsertQuery(
      database,
      {
        storeId,
        normalizedText: "wild rice",
        action: "updated",
        productConceptId,
        productConceptName: "Rice",
        aisleSectionId,
        aisleSectionLabel: "Aisle 2 · Dry goods",
        createdByUserId: "user-a",
        now,
      },
    ).toSQL();

    expect(query).toContain('insert into "product_learning_events"');
    expect(query).toContain("returning");
    expect(params).toEqual([
      storeId,
      "wild rice",
      "updated",
      productConceptId,
      "Rice",
      aisleSectionId,
      "Aisle 2 · Dry goods",
      "user-a",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("lists learning events for the store newest-first with the actor name", () => {
    const { sql: query, params } = buildProductLearningEventListQuery(
      database,
      storeId,
    ).toSQL();

    expect(query).toContain('from "product_learning_events"');
    expect(query).toContain('left join "user"');
    expect(query).toContain(
      'order by "product_learning_events"."created_at" desc',
    );
    expect(params).toEqual([storeId]);
  });
});
