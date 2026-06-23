import { describe, expect, it } from "vitest";

import { createDatabase } from "../create-client";
import {
  buildActiveShoppingListQuery,
  buildProductAliasLookupQuery,
  buildRouteOrderedShoppingItemsQuery,
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
    expect(query).toContain(
      '"shopping_items"."store_id" = "product_locations"."store_id"',
    );
    expect(query).toContain(
      '"product_locations"."store_id" = "aisle_sections"."store_id"',
    );
    expect(query).toContain('"shopping_items"."store_id" = $2');
    expect(query).toMatch(
      /order by case when "aisle_sections"\."path_order" is null then 1 else 0 end asc, "aisle_sections"\."path_order" asc, coalesce\("product_locations"\."position_within_section", 2147483647\) asc, "shopping_items"\."order_key" asc/,
    );
  });

  it("prefers learned corrections, then store-scoped aliases", () => {
    const { sql: query, params } = buildProductAliasLookupQuery(
      database,
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      "wild rice",
    ).toSQL();

    expect(query).toContain('"product_aliases"."is_correction" desc');
    expect(query).toContain(
      'case when "product_aliases"."scope" = \'store\' then 1 else 0 end desc',
    );
    expect(params).toEqual([
      "wild rice",
      "global",
      "store",
      "fd3d8b7c-1d15-4f4e-b169-a4e36d8c5f50",
      1,
    ]);
  });
});
