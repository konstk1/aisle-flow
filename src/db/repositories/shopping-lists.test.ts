import { describe, expect, it } from "vitest";

import { createDatabase } from "../create-client";
import {
  buildActiveShoppingListCreateQuery,
  buildActiveShoppingListQuery,
  buildExactProductAliasLookupQuery,
  buildRouteOrderedShoppingItemsQuery,
  buildShoppingItemCheckStateQuery,
  buildShoppingItemUpsertQuery,
} from "./shopping-lists";

const database = createDatabase(
  "postgresql://user:password@localhost:5432/aisle_flow",
);

describe("shopping-list queries", () => {
  it("looks up the active list for a store", () => {
    const { sql: query, params } = buildActiveShoppingListQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
    ).toSQL();

    expect(query).toContain('from "shopping_lists"');
    expect(query).toContain('"shopping_lists"."state" = $2');
    expect(params).toEqual([
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "active",
      1,
    ]);
  });

  it("orders resolved items by route, section position, and user order", () => {
    const { sql: query } = buildRouteOrderedShoppingItemsQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
    ).toSQL();

    expect(query).toContain('left join "product_locations"');
    expect(query).toContain('left join "aisle_sections"');
    expect(query).toContain('left join "aisles"');
    expect(query).toContain(
      '"shopping_items"."store_id" = "product_locations"."store_id"',
    );
    expect(query).toContain(
      '"product_locations"."store_id" = "aisle_sections"."store_id"',
    );
    expect(query).toContain(
      '"aisle_sections"."store_id" = "aisles"."store_id"',
    );
    expect(query).toContain('"shopping_items"."store_id" = $2');
    expect(query).toMatch(
      /order by case when "aisle_sections"\."path_order" is null then 1 else 0 end asc, "aisle_sections"\."path_order" asc, coalesce\("product_locations"\."position_within_section", 2147483647\) asc, "shopping_items"\."order_key" asc/,
    );
  });

  it("creates the active list through the one-active-per-store conflict target", () => {
    const { sql: query, params } = buildActiveShoppingListCreateQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
    ).toSQL();

    expect(query).toContain('insert into "shopping_lists"');
    expect(query).toContain(
      'on conflict ("store_id") where "shopping_lists"."state" = \'active\' do update set "updated_at" = "shopping_lists"."updated_at"',
    );
    expect(params).toEqual([
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "active",
      "manual",
      "synced",
    ]);
  });

  it("upserts items by source identifier for idempotent local requests", () => {
    const { sql: query, params } = buildShoppingItemUpsertQuery(database, {
      storeId: "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      rawText: "Wild Rice",
      normalizedText: "wild rice",
      productConceptId: null,
      resolvedLocationId: null,
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
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "Wild Rice",
      "wild rice",
      null,
      null,
      "0000000000000:0000:manual:mutation",
      "manual:44444444-4444-4444-8444-444444444444",
      "synced",
      "44444444-4444-4444-8444-444444444444",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("updates check state idempotently within the active list", () => {
    const { sql: query, params } = buildShoppingItemCheckStateQuery(database, {
      storeId: "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      shoppingListId: "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      itemId: "33333333-3333-4333-8333-333333333333",
      isChecked: true,
      now: new Date("2026-01-01T00:00:00Z"),
    }).toSQL();

    expect(query).toContain('update "shopping_items"');
    expect(query).toContain('coalesce("shopping_items"."checked_at", $2)');
    expect(query).toContain(
      'case when "shopping_items"."is_checked" = $4 then "shopping_items"."updated_at" else $5 end',
    );
    expect(query).toContain('"shopping_items"."shopping_list_id" = $7');
    expect(params).toEqual([
      true,
      new Date("2026-01-01T00:00:00Z"),
      true,
      true,
      new Date("2026-01-01T00:00:00Z"),
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "cae0be4e-fb86-41df-86e8-4ba1dfe9dfc4",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("looks up learned and imported aliases before curated matching", () => {
    const { sql: query, params } = buildExactProductAliasLookupQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "wild rice",
    ).toSQL();

    expect(query).toContain('"product_aliases"."source" = $2');
    expect(query).toContain('"product_aliases"."source" = $3');
    expect(query).not.toContain('"product_aliases"."is_correction" =');
    expect(query).toContain('"product_aliases"."is_correction" desc');
    expect(params).toEqual([
      "wild rice",
      "learned",
      "imported",
      "global",
      "store",
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      1,
    ]);
  });
});
