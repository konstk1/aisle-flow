import { describe, expect, it } from "vitest";

import { createDatabase } from "../create-client";
import {
  buildManualProductAliasCorrectionQuery,
  buildManualProductLocationCorrectionQuery,
  buildProductConceptCreateQuery,
  buildProductConceptListQuery,
  productConceptIdByNormalizedName,
} from "./product-corrections";

const database = createDatabase(
  "postgresql://user:password@localhost:5432/aisle_flow",
);

const now = new Date("2026-01-01T00:00:00Z");
const storeId = "11111111-1111-4111-8111-111111111111";
const userId = "user-a";
const productConceptId = "22222222-2222-4222-8222-222222222222";
const aisleSectionId = "33333333-3333-4333-8333-333333333333";

describe("product correction queries", () => {
  it("lists concepts with their location in the given store", () => {
    const { sql: query, params } = buildProductConceptListQuery(
      database,
      userId,
      storeId,
    ).toSQL();

    expect(query).toContain('from "product_concepts"');
    expect(query).toContain('left join "product_locations"');
    expect(query).toContain('"product_locations"."store_id" = $');
    expect(query).toContain(
      'order by "product_concepts"."normalized_name" asc',
    );
    expect(params).toContain(userId);
    expect(params).toContain(storeId);
  });

  it("lists concepts without locations when no store is selected", () => {
    const { sql: query, params } = buildProductConceptListQuery(
      database,
      userId,
      null,
    ).toSQL();

    expect(query).toContain('left join "product_locations"');
    expect(query).toContain("false");
    expect(query).not.toContain('"product_locations"."store_id" = $');
    expect(params).toContain(userId);
  });

  it("returns a concept when normalized concept creation conflicts", () => {
    const { sql: query, params } = buildProductConceptCreateQuery(database, {
      userId,
      canonicalName: "bulk grains",
      normalizedName: "bulk grains",
    }).toSQL();

    expect(query).toContain('insert into "product_concepts"');
    expect(query).toContain(
      'on conflict ("user_id","normalized_name") where "product_concepts"."deleted_at" is null do update set "canonical_name" = "product_concepts"."canonical_name"',
    );
    expect(query).toContain("returning");
    expect(params).toContain(userId);
    expect(params).toContain("bulk grains");
  });

  it("upserts an exact learned user alias for later precedence", () => {
    const { sql: query, params } = buildManualProductAliasCorrectionQuery(
      database,
      {
        userId,
        productConceptId,
        displayText: "Wild Rice",
        normalizedText: "wild rice",
        now,
      },
    ).toSQL();

    expect(query).toContain('insert into "product_aliases"');
    expect(query).toContain(
      'on conflict ("user_id","normalized_text") where "product_aliases"."deleted_at" is null do update set',
    );
    expect(query).toContain(
      '"product_concept_id" = excluded.product_concept_id',
    );
    expect(query).toContain('"confidence" = excluded.confidence');
    expect(query).toContain('"source" = excluded.source');
    expect(query).toContain('"is_correction" = excluded.is_correction');
    expect(query).toContain("returning");
    expect(params).toContain(productConceptId);
    expect(params).toContain("Wild Rice");
    expect(params).toContain("wild rice");
  });

  it("can upsert a learned alias for a concept created earlier in the same batch", () => {
    const { sql: query, params } = buildManualProductAliasCorrectionQuery(
      database,
      {
        userId,
        productConceptId: productConceptIdByNormalizedName(
          userId,
          "dried fruit",
        ),
        displayText: "Dried Mango",
        normalizedText: "dried mango",
        now,
      },
    ).toSQL();

    expect(query).toContain(
      '(select "product_concepts"."id" from "product_concepts" where ("product_concepts"."user_id" = $1 and "product_concepts"."normalized_name" = $2 and "product_concepts"."deleted_at" is null) limit 1)',
    );
    expect(query).toContain(
      '"product_concept_id" = excluded.product_concept_id',
    );
    expect(params).toContain("dried fruit");
    expect(params).toContain("Dried Mango");
  });

  it("updates the one store-specific product location for a concept", () => {
    const { sql: query, params } = buildManualProductLocationCorrectionQuery(
      database,
      {
        userId,
        storeId,
        productConceptId,
        aisleSectionId,
        now,
      },
    ).toSQL();

    expect(query).toContain('insert into "product_locations"');
    expect(query).toContain(
      'on conflict ("user_id","store_id","product_concept_id") do update set',
    );
    expect(query).toContain('"aisle_section_id" = excluded.aisle_section_id');
    expect(query).not.toContain("position_within_section");
    expect(query).toContain('"source" = excluded.source');
    expect(query).toContain('"version" = "product_locations"."version" + 1');
    expect(query).toContain("returning");
    expect(params).toContain(userId);
    expect(params).toContain(storeId);
  });
});
