import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const aisleSectionSide = pgEnum("aisle_section_side", [
  "left",
  "right",
  "center",
  "endcap",
]);

export const productAliasScope = pgEnum("product_alias_scope", [
  "global",
  "store",
]);

export const productAliasSource = pgEnum("product_alias_source", [
  "curated",
  "learned",
  "imported",
]);

export const productLocationSource = pgEnum("product_location_source", [
  "curated",
  "manual",
  "inferred",
  "imported",
]);

export const productLearningEventAction = pgEnum(
  "product_learning_event_action",
  ["created", "updated", "deleted"],
);

export const shoppingListState = pgEnum("shopping_list_state", [
  "active",
  "inactive",
]);

export const shoppingListSource = pgEnum("shopping_list_source", [
  "manual",
  "import",
  "provider",
]);

export const synchronizationState = pgEnum("synchronization_state", [
  "synced",
  "pending",
  "error",
]);

export const sourceConnectionStatus = pgEnum("source_connection_status", [
  "active",
  "disconnected",
  "error",
]);

export const syncDirection = pgEnum("sync_direction", ["pull", "push"]);

export const syncOperationStatus = pgEnum("sync_operation_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    currentStoreId: uuid("current_store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("user_email_unique").on(table.email),
    check("user_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check("user_email_not_blank", sql`length(btrim(${table.email})) > 0`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("session_token_unique").on(table.token),
    index("session_user_id_index").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("account_user_id_index").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("verification_identifier_index").on(table.identifier),
    check(
      "verification_identifier_not_blank",
      sql`length(btrim(${table.identifier})) > 0`,
    ),
    check(
      "verification_value_not_blank",
      sql`length(btrim(${table.value})) > 0`,
    ),
  ],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("stores_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check("stores_version_positive", sql`${table.version} > 0`),
  ],
);

export const aisles = pgTable(
  "aisles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    identifier: text("identifier").notNull(),
    displayName: text("display_name"),
    displayOrder: integer("display_order").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("aisles_store_id_id_unique").on(table.storeId, table.id),
    unique("aisles_store_identifier_unique").on(
      table.storeId,
      table.identifier,
    ),
    unique("aisles_store_display_order_unique").on(
      table.storeId,
      table.displayOrder,
    ),
    check(
      "aisles_identifier_not_blank",
      sql`length(btrim(${table.identifier})) > 0`,
    ),
    check("aisles_display_order_non_negative", sql`${table.displayOrder} >= 0`),
    check("aisles_version_positive", sql`${table.version} > 0`),
  ],
);

export const aisleSections = pgTable(
  "aisle_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    aisleId: uuid("aisle_id").notNull(),
    label: text("label"),
    pathOrder: integer("path_order").notNull(),
    side: aisleSectionSide("side").default("center").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("aisle_sections_store_id_id_unique").on(table.storeId, table.id),
    unique("aisle_sections_store_path_order_unique").on(
      table.storeId,
      table.pathOrder,
    ),
    index("aisle_sections_store_path_order_index").on(
      table.storeId,
      table.pathOrder,
    ),
    foreignKey({
      name: "aisle_sections_store_aisle_foreign_key",
      columns: [table.storeId, table.aisleId],
      foreignColumns: [aisles.storeId, aisles.id],
    }).onDelete("cascade"),
    check(
      "aisle_sections_path_order_non_negative",
      sql`${table.pathOrder} >= 0`,
    ),
    check("aisle_sections_version_positive", sql`${table.version} > 0`),
  ],
);

export const productConcepts = pgTable(
  "product_concepts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    excludedTerms: text("excluded_terms").array().notNull().default([]),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("product_concepts_normalized_name_unique").on(table.normalizedName),
    check(
      "product_concepts_canonical_name_not_blank",
      sql`length(btrim(${table.canonicalName})) > 0`,
    ),
    check(
      "product_concepts_normalized_name_not_blank",
      sql`length(btrim(${table.normalizedName})) > 0`,
    ),
    check("product_concepts_version_positive", sql`${table.version} > 0`),
  ],
);

export const productAliases = pgTable(
  "product_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productConceptId: uuid("product_concept_id")
      .notNull()
      .references(() => productConcepts.id, { onDelete: "restrict" }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "cascade",
    }),
    normalizedText: text("normalized_text").notNull(),
    scope: productAliasScope("scope").notNull(),
    confidence: real("confidence").default(1).notNull(),
    source: productAliasSource("source").default("curated").notNull(),
    isCorrection: boolean("is_correction").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("product_aliases_global_normalized_text_unique")
      .on(table.normalizedText)
      .where(sql`${table.scope} = 'global'`),
    uniqueIndex("product_aliases_store_normalized_text_unique")
      .on(table.storeId, table.normalizedText)
      .where(sql`${table.scope} = 'store'`),
    index("product_aliases_lookup_index").on(
      table.normalizedText,
      table.storeId,
    ),
    check(
      "product_aliases_scope_store_consistency",
      sql`(${table.scope} = 'global' AND ${table.storeId} IS NULL) OR (${table.scope} = 'store' AND ${table.storeId} IS NOT NULL)`,
    ),
    check(
      "product_aliases_normalized_text_not_blank",
      sql`length(btrim(${table.normalizedText})) > 0`,
    ),
    check(
      "product_aliases_confidence_in_range",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
);

export const productLocations = pgTable(
  "product_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productConceptId: uuid("product_concept_id")
      .notNull()
      .references(() => productConcepts.id, { onDelete: "restrict" }),
    aisleSectionId: uuid("aisle_section_id").notNull(),
    positionWithinSection: integer("position_within_section"),
    confidence: real("confidence").default(1).notNull(),
    source: productLocationSource("source").default("curated").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("product_locations_store_id_id_unique").on(table.storeId, table.id),
    unique("product_locations_store_product_concept_unique").on(
      table.storeId,
      table.productConceptId,
    ),
    index("product_locations_product_store_index").on(
      table.productConceptId,
      table.storeId,
    ),
    index("product_locations_section_position_index").on(
      table.aisleSectionId,
      table.positionWithinSection,
    ),
    foreignKey({
      name: "product_locations_store_section_foreign_key",
      columns: [table.storeId, table.aisleSectionId],
      foreignColumns: [aisleSections.storeId, aisleSections.id],
    }).onDelete("restrict"),
    check(
      "product_locations_position_non_negative",
      sql`${table.positionWithinSection} IS NULL OR ${table.positionWithinSection} >= 0`,
    ),
    check(
      "product_locations_confidence_in_range",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check("product_locations_version_positive", sql`${table.version} > 0`),
  ],
);

export const productLearningEvents = pgTable(
  "product_learning_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    normalizedText: text("normalized_text").notNull(),
    action: productLearningEventAction("action").notNull(),
    productConceptId: uuid("product_concept_id").references(
      () => productConcepts.id,
      { onDelete: "set null" },
    ),
    // Display snapshots survive deletion of the referenced rows.
    productConceptName: text("product_concept_name").notNull(),
    aisleSectionId: uuid("aisle_section_id").references(
      () => aisleSections.id,
      { onDelete: "set null" },
    ),
    aisleSectionLabel: text("aisle_section_label"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("product_learning_events_store_text_index").on(
      table.storeId,
      table.normalizedText,
      table.createdAt,
    ),
    check(
      "product_learning_events_normalized_text_not_blank",
      sql`length(btrim(${table.normalizedText})) > 0`,
    ),
    check(
      "product_learning_events_concept_name_not_blank",
      sql`length(btrim(${table.productConceptName})) > 0`,
    ),
  ],
);

export const sourceConnections = pgTable(
  "source_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id"),
    status: sourceConnectionStatus("status").default("active").notNull(),
    encryptedCredentialsRef: text("encrypted_credentials_ref"),
    protectedMetadata: jsonb("protected_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    syncCursor: text("sync_cursor"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("source_connections_store_id_id_unique").on(table.storeId, table.id),
    uniqueIndex("source_connections_store_provider_account_unique")
      .on(table.storeId, table.provider, table.externalAccountId)
      .where(sql`${table.externalAccountId} IS NOT NULL`),
    check(
      "source_connections_provider_not_blank",
      sql`length(btrim(${table.provider})) > 0`,
    ),
    check("source_connections_version_positive", sql`${table.version} > 0`),
  ],
);

export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sourceConnectionId: uuid("source_connection_id"),
    externalId: text("external_id"),
    state: shoppingListState("state").default("active").notNull(),
    source: shoppingListSource("source").default("manual").notNull(),
    syncState: synchronizationState("sync_state").default("synced").notNull(),
    syncCursor: text("sync_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("shopping_lists_store_id_id_unique").on(table.storeId, table.id),
    uniqueIndex("shopping_lists_one_active_per_user_store")
      .on(table.userId, table.storeId)
      .where(sql`${table.state} = 'active'`),
    uniqueIndex("shopping_lists_source_external_id_unique")
      .on(table.sourceConnectionId, table.externalId)
      .where(
        sql`${table.sourceConnectionId} IS NOT NULL AND ${table.externalId} IS NOT NULL`,
      ),
    index("shopping_lists_active_store_index")
      .on(table.storeId, table.updatedAt)
      .where(sql`${table.state} = 'active'`),
    index("shopping_lists_user_store_index").on(table.userId, table.storeId),
    foreignKey({
      name: "shopping_lists_store_connection_foreign_key",
      columns: [table.storeId, table.sourceConnectionId],
      foreignColumns: [sourceConnections.storeId, sourceConnections.id],
    }).onDelete("restrict"),
    check(
      "shopping_lists_provider_connection_consistency",
      sql`(${table.source} = 'provider' AND ${table.sourceConnectionId} IS NOT NULL AND ${table.externalId} IS NOT NULL) OR (${table.source} <> 'provider' AND ${table.sourceConnectionId} IS NULL)`,
    ),
    check("shopping_lists_version_positive", sql`${table.version} > 0`),
  ],
);

export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull(),
    shoppingListId: uuid("shopping_list_id").notNull(),
    rawText: text("raw_text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    productConceptId: uuid("product_concept_id").references(
      () => productConcepts.id,
      { onDelete: "set null" },
    ),
    resolvedLocationId: uuid("resolved_location_id"),
    isChecked: boolean("is_checked").default(false).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    orderKey: text("order_key").notNull(),
    sourceIdentifier: text("source_identifier"),
    syncState: synchronizationState("sync_state").default("synced").notNull(),
    mutationId: uuid("mutation_id").defaultRandom().notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("shopping_items_list_source_identifier_unique")
      .on(table.shoppingListId, table.sourceIdentifier)
      .where(sql`${table.sourceIdentifier} IS NOT NULL`),
    unique("shopping_items_list_mutation_id_unique").on(
      table.shoppingListId,
      table.mutationId,
    ),
    index("shopping_items_active_list_read_index").on(
      table.shoppingListId,
      table.isChecked,
      table.orderKey,
    ),
    index("shopping_items_snoozed_index")
      .on(table.shoppingListId, table.snoozedUntil)
      .where(sql`${table.snoozedUntil} IS NOT NULL`),
    index("shopping_items_normalized_text_index").on(table.normalizedText),
    foreignKey({
      name: "shopping_items_store_list_foreign_key",
      columns: [table.storeId, table.shoppingListId],
      foreignColumns: [shoppingLists.storeId, shoppingLists.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "shopping_items_store_location_foreign_key",
      columns: [table.storeId, table.resolvedLocationId],
      foreignColumns: [productLocations.storeId, productLocations.id],
    }).onDelete("restrict"),
    check(
      "shopping_items_raw_text_not_blank",
      sql`length(btrim(${table.rawText})) > 0`,
    ),
    check(
      "shopping_items_normalized_text_not_blank",
      sql`length(btrim(${table.normalizedText})) > 0`,
    ),
    check(
      "shopping_items_order_key_not_blank",
      sql`length(btrim(${table.orderKey})) > 0`,
    ),
    check(
      "shopping_items_checked_at_consistency",
      sql`(${table.isChecked} = false AND ${table.checkedAt} IS NULL) OR (${table.isChecked} = true AND ${table.checkedAt} IS NOT NULL)`,
    ),
    check("shopping_items_version_positive", sql`${table.version} > 0`),
  ],
);

export const syncOperations = pgTable(
  "sync_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull(),
    shoppingListId: uuid("shopping_list_id").notNull(),
    sourceConnectionId: uuid("source_connection_id").notNull(),
    mutationId: uuid("mutation_id").notNull(),
    direction: syncDirection("direction").notNull(),
    status: syncOperationStatus("status").default("pending").notNull(),
    cursorBefore: text("cursor_before"),
    cursorAfter: text("cursor_after"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("sync_operations_connection_mutation_unique").on(
      table.sourceConnectionId,
      table.mutationId,
    ),
    index("sync_operations_list_status_index").on(
      table.shoppingListId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      name: "sync_operations_store_list_foreign_key",
      columns: [table.storeId, table.shoppingListId],
      foreignColumns: [shoppingLists.storeId, shoppingLists.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "sync_operations_store_connection_foreign_key",
      columns: [table.storeId, table.sourceConnectionId],
      foreignColumns: [sourceConnections.storeId, sourceConnections.id],
    }).onDelete("cascade"),
    check(
      "sync_operations_completion_order",
      sql`${table.completedAt} IS NULL OR ${table.startedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
export type Aisle = typeof aisles.$inferSelect;
export type NewAisle = typeof aisles.$inferInsert;
export type AisleSection = typeof aisleSections.$inferSelect;
export type NewAisleSection = typeof aisleSections.$inferInsert;
export type ProductConcept = typeof productConcepts.$inferSelect;
export type NewProductConcept = typeof productConcepts.$inferInsert;
export type ProductAlias = typeof productAliases.$inferSelect;
export type NewProductAlias = typeof productAliases.$inferInsert;
export type ProductLocation = typeof productLocations.$inferSelect;
export type NewProductLocation = typeof productLocations.$inferInsert;
export type ProductLearningEvent = typeof productLearningEvents.$inferSelect;
export type NewProductLearningEvent = typeof productLearningEvents.$inferInsert;
export type ShoppingList = typeof shoppingLists.$inferSelect;
export type NewShoppingList = typeof shoppingLists.$inferInsert;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type NewShoppingItem = typeof shoppingItems.$inferInsert;
export type SourceConnection = typeof sourceConnections.$inferSelect;
export type NewSourceConnection = typeof sourceConnections.$inferInsert;
export type SyncOperation = typeof syncOperations.$inferSelect;
export type NewSyncOperation = typeof syncOperations.$inferInsert;
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
