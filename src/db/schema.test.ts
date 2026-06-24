import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  aisles,
  aisleSections,
  productAliases,
  productLocations,
  shoppingItems,
  shoppingLists,
} from "./schema";

function indexNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).indexes.map((index) => index.config.name);
}

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).uniqueConstraints.map(
    (constraint) => constraint.name,
  );
}

function checkNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).checks.map((check) => check.name);
}

function foreignKeyNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((foreignKey) =>
    foreignKey.getName(),
  );
}

describe("data model constraints", () => {
  it("keeps aisle sections in their owning store with one unambiguous route order", () => {
    expect(foreignKeyNames(aisleSections)).toContain(
      "aisle_sections_store_aisle_foreign_key",
    );
    expect(checkNames(aisleSections)).toContain(
      "aisle_sections_path_order_non_negative",
    );
    expect(uniqueConstraintNames(aisleSections)).toEqual(
      expect.arrayContaining(["aisle_sections_store_path_order_unique"]),
    );
    expect(uniqueConstraintNames(aisles)).toEqual(
      expect.arrayContaining(["aisles_store_display_order_unique"]),
    );
    expect(aisles).not.toHaveProperty("routeOrder");
    expect(aisles).not.toHaveProperty("traversalDirection");
    expect(aisles).toHaveProperty("displayOrder");
    expect(aisleSections).not.toHaveProperty("sectionOrder");
  });

  it("prevents conflicting aliases within global and store scopes", () => {
    expect(indexNames(productAliases)).toEqual(
      expect.arrayContaining([
        "product_aliases_global_normalized_text_unique",
        "product_aliases_store_normalized_text_unique",
        "product_aliases_lookup_index",
      ]),
    );
    expect(checkNames(productAliases)).toContain(
      "product_aliases_scope_store_consistency",
    );
  });

  it("keeps a resolved location and list item within the same store", () => {
    expect(foreignKeyNames(productLocations)).toContain(
      "product_locations_store_section_foreign_key",
    );
    expect(foreignKeyNames(shoppingItems)).toEqual(
      expect.arrayContaining([
        "shopping_items_store_list_foreign_key",
        "shopping_items_store_location_foreign_key",
      ]),
    );
  });

  it("allows at most one active list per store and indexes its item reads", () => {
    expect(indexNames(shoppingLists)).toEqual(
      expect.arrayContaining([
        "shopping_lists_one_active_per_store",
        "shopping_lists_active_store_index",
      ]),
    );
    expect(indexNames(shoppingItems)).toContain(
      "shopping_items_active_list_read_index",
    );
  });
});
