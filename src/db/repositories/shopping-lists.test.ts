import { describe, expect, it } from "vitest";

import { createDatabase } from "../create-client";
import { productConceptIdByNormalizedName } from "./product-corrections";
import {
  buildActiveShoppingListCreateQuery,
  buildActiveShoppingListQuery,
  buildCompletedShoppingItemsQuery,
  buildExactProductAliasLookupQuery,
  buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery,
  buildShoppingItemDeleteQuery,
  buildShoppingItemProductResolutionQuery,
  buildShoppingItemSnoozeStateQuery,
  buildShoppingItemTextUpdateQuery,
  buildShoppingItemsByNormalizedTextQuery,
  buildShoppingItemUpsertQuery,
  buildSnoozedShoppingItemsQuery,
} from "./shopping-lists";

const database = createDatabase(
  "postgresql://user:password@localhost:5432/aisle_flow",
);

describe("shopping-list queries", () => {
  it("looks up the user's active list", () => {
    const { sql: query, params } = buildActiveShoppingListQuery(
      database,
      "user-a",
    ).toSQL();

    expect(query).toContain('from "shopping_lists"');
    expect(query).toContain('"shopping_lists"."user_id" = $1');
    expect(query).toContain('"shopping_lists"."state" = $2');
    expect(query).not.toContain("store_id");
    expect(params).toEqual(["user-a", "active", 1]);
  });

  it("orders resolved items by route, section position, and user order", () => {
    const { sql: query, params } = buildRouteOrderedShoppingItemsQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      new Date("2026-01-01T00:00:00Z"),
    ).toSQL();

    expect(query).toContain('left join "product_locations"');
    expect(query).toContain('left join "aisle_sections"');
    expect(query).toContain('left join "aisles"');
    expect(query).toContain(
      '"product_locations"."product_concept_id" = "shopping_items"."product_concept_id"',
    );
    expect(query).toContain('"product_locations"."store_id" = $1');
    expect(query).toContain(
      '"product_locations"."store_id" = "aisle_sections"."store_id"',
    );
    expect(query).toContain(
      '"aisle_sections"."store_id" = "aisles"."store_id"',
    );
    expect(query).toContain(
      '("shopping_items"."is_checked" = $3 or "shopping_items"."checked_at" > $4)',
    );
    expect(query).toContain(
      '("shopping_items"."snoozed_until" is null or "shopping_items"."snoozed_until" <= $5)',
    );
    expect(query).toMatch(
      /order by case when "aisle_sections"\."path_order" is null then 1 else 0 end asc, "aisle_sections"\."path_order" asc, coalesce\("product_locations"\."position_within_section", 2147483647\) asc, "shopping_items"\."order_key" asc/,
    );
    expect(params).toEqual([
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      false,
      "2025-12-31T20:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("resolves no locations when the user has no current store", () => {
    const { sql: query, params } = buildRouteOrderedShoppingItemsQuery(
      database,
      null,
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      new Date("2026-01-01T00:00:00Z"),
    ).toSQL();

    expect(query).toContain(
      'left join "product_locations" on ("product_locations"."product_concept_id" = "shopping_items"."product_concept_id" and false)',
    );
    expect(params).toEqual([
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      false,
      "2025-12-31T20:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("orders snoozed items by soonest resurfacing first", () => {
    const { sql: query, params } = buildSnoozedShoppingItemsQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      new Date("2026-01-01T00:00:00Z"),
    ).toSQL();

    expect(query).toContain('"shopping_items"."is_checked" = $3');
    expect(query).toContain('"shopping_items"."snoozed_until" is not null');
    expect(query).toContain('"shopping_items"."snoozed_until" > $4');
    expect(query).toMatch(
      /order by "shopping_items"\."snoozed_until" asc, "shopping_items"\."order_key" asc, "shopping_items"\."created_at" asc/,
    );
    expect(params).toEqual([
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      false,
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("orders completed items by newest completion date first", () => {
    const { sql: query, params } = buildCompletedShoppingItemsQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      new Date("2026-01-01T00:00:00Z"),
    ).toSQL();

    expect(query).toContain('left join "product_locations"');
    expect(query).toContain('"shopping_items"."is_checked" = $3');
    expect(query).toContain('"shopping_items"."checked_at" <= $4');
    expect(query).toMatch(
      /order by "shopping_items"\."checked_at" desc, "shopping_items"\."updated_at" desc, "shopping_items"\."created_at" desc/,
    );
    expect(params).toEqual([
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      true,
      "2025-12-31T20:00:00.000Z",
    ]);
  });

  it("creates the active list through the one-active-per-user conflict target", () => {
    const { sql: query, params } = buildActiveShoppingListCreateQuery(
      database,
      "user-a",
    ).toSQL();

    expect(query).toContain('insert into "shopping_lists"');
    expect(query).toContain(
      'on conflict ("user_id") where "shopping_lists"."state" = \'active\' do update set "updated_at" = "shopping_lists"."updated_at"',
    );
    expect(params).toEqual(["user-a", "active", "manual"]);
  });

  it("upserts items by source identifier for idempotent local requests", () => {
    const { sql: query, params } = buildShoppingItemUpsertQuery(database, {
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      rawText: "Wild Rice",
      normalizedText: "wild rice",
      quantityText: null,
      productConceptId: null,
      categorizationConfidence: 0,
      categorizationSource: "deterministic",
      suggestedProductConceptName: null,
      orderKey: "0000000000000:0000:manual:mutation",
      sourceIdentifier: "manual:44444444-4444-4444-8444-444444444444",
      mutationId: "44444444-4444-4444-8444-444444444444",
      now: new Date("2026-01-01T00:00:00Z"),
    }).toSQL();

    expect(query).toContain('insert into "shopping_items"');
    expect(query).toContain(
      'on conflict ("shopping_list_id","source_identifier") where "shopping_items"."source_identifier" IS NOT NULL do update set "updated_at" = "shopping_items"."updated_at"',
    );
    expect(params).toEqual([
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "Wild Rice",
      "wild rice",
      null,
      null,
      0,
      "deterministic",
      null,
      "0000000000000:0000:manual:mutation",
      "manual:44444444-4444-4444-8444-444444444444",
      "44444444-4444-4444-8444-444444444444",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("updates check state idempotently within the active list", () => {
    const { sql: query, params } = buildShoppingItemCheckStateQuery(database, {
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      itemId: "33333333-3333-4333-8333-333333333333",
      isChecked: true,
      now: new Date("2026-01-01T00:00:00Z"),
    }).toSQL();

    expect(query).toContain('update "shopping_items"');
    expect(query).toContain('coalesce("shopping_items"."checked_at", $2)');
    expect(query).toContain(
      'case when "shopping_items"."is_checked" = $3 then "shopping_items"."snoozed_until" else null end',
    );
    expect(query).toContain(
      'case when "shopping_items"."is_checked" = $5 then "shopping_items"."updated_at" else $6 end',
    );
    expect(query).toContain('"shopping_items"."shopping_list_id" = $7');
    expect(params).toEqual([
      true,
      new Date("2026-01-01T00:00:00Z"),
      true,
      true,
      true,
      new Date("2026-01-01T00:00:00Z"),
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("snoozes an unchecked item within the active list", () => {
    const { sql: query, params } = buildShoppingItemSnoozeStateQuery(database, {
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      itemId: "33333333-3333-4333-8333-333333333333",
      snoozedUntil: new Date("2026-01-01T01:00:00Z"),
      now: new Date("2026-01-01T00:00:00Z"),
    }).toSQL();

    expect(query).toContain('update "shopping_items"');
    expect(query).toContain('"snoozed_until" = $1');
    expect(query).toContain('"version" = "shopping_items"."version" + 1');
    expect(query).toContain('"shopping_items"."is_checked" = $5');
    expect(params).toEqual([
      "2026-01-01T01:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "33333333-3333-4333-8333-333333333333",
      false,
    ]);
  });

  it("clears a snooze to resurface an item", () => {
    const { params } = buildShoppingItemSnoozeStateQuery(database, {
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      itemId: "33333333-3333-4333-8333-333333333333",
      snoozedUntil: null,
      now: new Date("2026-01-01T00:00:00Z"),
    }).toSQL();

    expect(params[0]).toBeNull();
  });

  it("updates item text and resolution within the active list", () => {
    const { sql: query, params } = buildShoppingItemTextUpdateQuery(database, {
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      itemId: "33333333-3333-4333-8333-333333333333",
      rawText: "Wild Rice",
      normalizedText: "wild rice",
      productConceptId: "11111111-1111-4111-8111-111111111111",
      categorizationConfidence: 0.95,
      categorizationSource: "deterministic",
      now: new Date("2026-01-01T00:00:00Z"),
    }).toSQL();

    expect(query).toContain('update "shopping_items"');
    expect(query).toContain('"raw_text" = $1');
    expect(query).toContain('"normalized_text" = $2');
    expect(query).toContain('"product_concept_id" = $3');
    expect(query).not.toContain("resolved_location_id");
    expect(query).toContain('"version" = "shopping_items"."version" + 1');
    expect(query).toContain('"shopping_items"."id" = $9');
    expect(params).toEqual([
      "Wild Rice",
      "wild rice",
      "11111111-1111-4111-8111-111111111111",
      0.95,
      "deterministic",
      null,
      "2026-01-01T00:00:00.000Z",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("deletes an item within the active list", () => {
    const { sql: query, params } = buildShoppingItemDeleteQuery(database, {
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      itemId: "33333333-3333-4333-8333-333333333333",
    }).toSQL();

    expect(query).toContain('delete from "shopping_items"');
    expect(query).toContain('"shopping_items"."shopping_list_id" = $1');
    expect(query).toContain('"shopping_items"."id" = $2');
    expect(params).toEqual([
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("relinks a corrected product match within the active list", () => {
    const { sql: query, params } = buildShoppingItemProductResolutionQuery(
      database,
      {
        shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
        normalizedText: "wild rice",
        productConceptId: "11111111-1111-4111-8111-111111111111",
        now: new Date("2026-01-01T00:00:00Z"),
      },
    ).toSQL();

    expect(query).toContain('update "shopping_items"');
    expect(query).toContain('"product_concept_id" = $1');
    expect(query).not.toContain("resolved_location_id");
    expect(query).toContain('"version" = "shopping_items"."version" + 1');
    expect(query).toContain('"shopping_items"."normalized_text" = $7');
    expect(params).toEqual([
      "11111111-1111-4111-8111-111111111111",
      1,
      "manual",
      null,
      "2026-01-01T00:00:00.000Z",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "wild rice",
    ]);
  });

  it("can relink a corrected product match using correction subqueries in the same batch", () => {
    const productConceptId = productConceptIdByNormalizedName("dried fruit");
    const { sql: query, params } = buildShoppingItemProductResolutionQuery(
      database,
      {
        shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
        normalizedText: "dried mango",
        productConceptId,
        now: new Date("2026-01-01T00:00:00Z"),
      },
    ).toSQL();

    expect(query).toContain(
      '"product_concept_id" = (select "product_concepts"."id" from "product_concepts" where "product_concepts"."normalized_name" = $1 limit 1)',
    );
    expect(params).toEqual([
      "dried fruit",
      1,
      "manual",
      null,
      "2026-01-01T00:00:00.000Z",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "dried mango",
    ]);
  });

  it("looks up existing unchecked active-list items by normalized text", () => {
    const { sql: query, params } = buildShoppingItemsByNormalizedTextQuery(
      database,
      {
        shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
        normalizedTexts: ["oatly", "rice"],
      },
    ).toSQL();

    expect(query).toContain('from "shopping_items"');
    expect(query).toContain('"shopping_items"."shopping_list_id" = $1');
    expect(query).toContain('"shopping_items"."is_checked" = $2');
    expect(query).toContain('"shopping_items"."normalized_text" in ($3, $4)');
    expect(params).toEqual([
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      false,
      "oatly",
      "rice",
    ]);
  });

  it("looks up learned and imported aliases before curated matching", () => {
    const { sql: query, params } = buildExactProductAliasLookupQuery(
      database,
      "user-a",
      "wild rice",
    ).toSQL();

    expect(query).toContain('"product_aliases"."source" = $2');
    expect(query).toContain('"product_aliases"."source" = $3');
    expect(query).toContain('"product_aliases"."user_id" = $');
    expect(query).not.toContain('"product_aliases"."is_correction" =');
    expect(query).toContain('"product_aliases"."is_correction" desc');
    expect(params).toEqual([
      "wild rice",
      "learned",
      "imported",
      "global",
      "user",
      "user-a",
      1,
    ]);
  });
});
