import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  account,
  aisles,
  aisleSections,
  productAliases,
  productLocations,
  session,
  shoppingItems,
  shoppingLists,
  user as authUsers,
  verification,
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
  it("defines Better Auth users, sessions, accounts, and verifications", () => {
    expect(uniqueConstraintNames(authUsers)).toContain("user_email_unique");
    expect(checkNames(authUsers)).toEqual(
      expect.arrayContaining(["user_name_not_blank", "user_email_not_blank"]),
    );
    expect(uniqueConstraintNames(session)).toContain("session_token_unique");
    expect(foreignKeyNames(session)).toContain("session_user_id_user_id_fk");
    expect(indexNames(session)).toContain("session_user_id_index");
    expect(uniqueConstraintNames(account)).toContain(
      "account_provider_account_unique",
    );
    expect(foreignKeyNames(account)).toContain("account_user_id_user_id_fk");
    expect(indexNames(account)).toContain("account_user_id_index");
    expect(indexNames(verification)).toContain("verification_identifier_index");
  });

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

  it("prevents conflicting aliases within global and user scopes", () => {
    expect(indexNames(productAliases)).toEqual(
      expect.arrayContaining([
        "product_aliases_global_normalized_text_unique",
        "product_aliases_user_normalized_text_unique",
        "product_aliases_lookup_index",
      ]),
    );
    expect(checkNames(productAliases)).toContain(
      "product_aliases_scope_user_consistency",
    );
  });

  it("keeps items on their list and locations in their store", () => {
    expect(foreignKeyNames(productLocations)).toContain(
      "product_locations_store_section_foreign_key",
    );
    expect(foreignKeyNames(shoppingItems)).toContain(
      "shopping_items_shopping_list_id_shopping_lists_id_fk",
    );
    expect(shoppingItems).not.toHaveProperty("storeId");
    expect(shoppingItems).not.toHaveProperty("resolvedLocationId");
  });

  it("allows at most one active list per user and indexes its item reads", () => {
    expect(shoppingLists).toHaveProperty("userId");
    expect(shoppingLists).not.toHaveProperty("storeId");
    expect(foreignKeyNames(shoppingLists)).toContain(
      "shopping_lists_user_id_user_id_fk",
    );
    expect(indexNames(shoppingLists)).toEqual(
      expect.arrayContaining(["shopping_lists_one_active_per_user"]),
    );
    expect(indexNames(shoppingItems)).toEqual(
      expect.arrayContaining([
        "shopping_items_active_list_read_index",
        "shopping_items_snoozed_index",
      ]),
    );
  });
});
