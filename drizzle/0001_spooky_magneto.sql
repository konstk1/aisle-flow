CREATE TYPE "public"."aisle_section_side" AS ENUM('left', 'right', 'center', 'endcap');--> statement-breakpoint
CREATE TYPE "public"."aisle_traversal_direction" AS ENUM('ascending', 'descending');--> statement-breakpoint
CREATE TYPE "public"."product_alias_scope" AS ENUM('global', 'store');--> statement-breakpoint
CREATE TYPE "public"."product_alias_source" AS ENUM('curated', 'learned', 'imported');--> statement-breakpoint
CREATE TYPE "public"."product_location_source" AS ENUM('curated', 'manual', 'inferred', 'imported');--> statement-breakpoint
CREATE TYPE "public"."shopping_list_source" AS ENUM('manual', 'import', 'provider');--> statement-breakpoint
CREATE TYPE "public"."shopping_list_state" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."source_connection_status" AS ENUM('active', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."sync_direction" AS ENUM('pull', 'push');--> statement-breakpoint
CREATE TYPE "public"."sync_operation_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."synchronization_state" AS ENUM('synced', 'pending', 'error');--> statement-breakpoint
CREATE TABLE "aisle_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"aisle_id" uuid NOT NULL,
	"label" text,
	"section_order" integer NOT NULL,
	"path_order" integer NOT NULL,
	"side" "aisle_section_side" DEFAULT 'center' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aisle_sections_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "aisle_sections_aisle_section_order_unique" UNIQUE("aisle_id","section_order"),
	CONSTRAINT "aisle_sections_store_path_order_unique" UNIQUE("store_id","path_order"),
	CONSTRAINT "aisle_sections_section_order_non_negative" CHECK ("aisle_sections"."section_order" >= 0),
	CONSTRAINT "aisle_sections_path_order_non_negative" CHECK ("aisle_sections"."path_order" >= 0),
	CONSTRAINT "aisle_sections_version_positive" CHECK ("aisle_sections"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "aisles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"display_name" text,
	"display_order" integer NOT NULL,
	"route_order" integer NOT NULL,
	"traversal_direction" "aisle_traversal_direction" DEFAULT 'ascending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aisles_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "aisles_store_identifier_unique" UNIQUE("store_id","identifier"),
	CONSTRAINT "aisles_store_display_order_unique" UNIQUE("store_id","display_order"),
	CONSTRAINT "aisles_store_route_order_unique" UNIQUE("store_id","route_order"),
	CONSTRAINT "aisles_identifier_not_blank" CHECK (length(btrim("aisles"."identifier")) > 0),
	CONSTRAINT "aisles_display_order_non_negative" CHECK ("aisles"."display_order" >= 0),
	CONSTRAINT "aisles_route_order_non_negative" CHECK ("aisles"."route_order" >= 0),
	CONSTRAINT "aisles_version_positive" CHECK ("aisles"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_concept_id" uuid NOT NULL,
	"store_id" uuid,
	"normalized_text" text NOT NULL,
	"scope" "product_alias_scope" NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"source" "product_alias_source" DEFAULT 'curated' NOT NULL,
	"is_correction" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_aliases_scope_store_consistency" CHECK (("product_aliases"."scope" = 'global' AND "product_aliases"."store_id" IS NULL) OR ("product_aliases"."scope" = 'store' AND "product_aliases"."store_id" IS NOT NULL)),
	CONSTRAINT "product_aliases_normalized_text_not_blank" CHECK (length(btrim("product_aliases"."normalized_text")) > 0),
	CONSTRAINT "product_aliases_confidence_in_range" CHECK ("product_aliases"."confidence" >= 0 AND "product_aliases"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "product_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"excluded_terms" text[] DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_concepts_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "product_concepts_canonical_name_not_blank" CHECK (length(btrim("product_concepts"."canonical_name")) > 0),
	CONSTRAINT "product_concepts_normalized_name_not_blank" CHECK (length(btrim("product_concepts"."normalized_name")) > 0),
	CONSTRAINT "product_concepts_version_positive" CHECK ("product_concepts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_concept_id" uuid NOT NULL,
	"aisle_section_id" uuid NOT NULL,
	"position_within_section" integer,
	"confidence" real DEFAULT 1 NOT NULL,
	"source" "product_location_source" DEFAULT 'curated' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_locations_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "product_locations_store_product_concept_unique" UNIQUE("store_id","product_concept_id"),
	CONSTRAINT "product_locations_position_non_negative" CHECK ("product_locations"."position_within_section" IS NULL OR "product_locations"."position_within_section" >= 0),
	CONSTRAINT "product_locations_confidence_in_range" CHECK ("product_locations"."confidence" >= 0 AND "product_locations"."confidence" <= 1),
	CONSTRAINT "product_locations_version_positive" CHECK ("product_locations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shopping_list_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"product_concept_id" uuid,
	"resolved_location_id" uuid,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"order_key" text NOT NULL,
	"source_identifier" text,
	"sync_state" "synchronization_state" DEFAULT 'synced' NOT NULL,
	"mutation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_items_list_mutation_id_unique" UNIQUE("shopping_list_id","mutation_id"),
	CONSTRAINT "shopping_items_raw_text_not_blank" CHECK (length(btrim("shopping_items"."raw_text")) > 0),
	CONSTRAINT "shopping_items_normalized_text_not_blank" CHECK (length(btrim("shopping_items"."normalized_text")) > 0),
	CONSTRAINT "shopping_items_order_key_not_blank" CHECK (length(btrim("shopping_items"."order_key")) > 0),
	CONSTRAINT "shopping_items_checked_at_consistency" CHECK (("shopping_items"."is_checked" = false AND "shopping_items"."checked_at" IS NULL) OR ("shopping_items"."is_checked" = true AND "shopping_items"."checked_at" IS NOT NULL)),
	CONSTRAINT "shopping_items_version_positive" CHECK ("shopping_items"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"source_connection_id" uuid,
	"external_id" text,
	"state" "shopping_list_state" DEFAULT 'active' NOT NULL,
	"source" "shopping_list_source" DEFAULT 'manual' NOT NULL,
	"sync_state" "synchronization_state" DEFAULT 'synced' NOT NULL,
	"sync_cursor" text,
	"last_synced_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_lists_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "shopping_lists_provider_connection_consistency" CHECK (("shopping_lists"."source" = 'provider' AND "shopping_lists"."source_connection_id" IS NOT NULL AND "shopping_lists"."external_id" IS NOT NULL) OR ("shopping_lists"."source" <> 'provider' AND "shopping_lists"."source_connection_id" IS NULL)),
	CONSTRAINT "shopping_lists_version_positive" CHECK ("shopping_lists"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "source_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text,
	"status" "source_connection_status" DEFAULT 'active' NOT NULL,
	"encrypted_credentials_ref" text,
	"protected_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sync_cursor" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_connections_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "source_connections_provider_not_blank" CHECK (length(btrim("source_connections"."provider")) > 0),
	CONSTRAINT "source_connections_version_positive" CHECK ("source_connections"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shopping_list_id" uuid NOT NULL,
	"source_connection_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"direction" "sync_direction" NOT NULL,
	"status" "sync_operation_status" DEFAULT 'pending' NOT NULL,
	"cursor_before" text,
	"cursor_after" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_operations_connection_mutation_unique" UNIQUE("source_connection_id","mutation_id"),
	CONSTRAINT "sync_operations_completion_order" CHECK ("sync_operations"."completed_at" IS NULL OR "sync_operations"."started_at" IS NULL OR "sync_operations"."completed_at" >= "sync_operations"."started_at")
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_store_aisle_foreign_key" FOREIGN KEY ("store_id","aisle_id") REFERENCES "public"."aisles"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_concept_id_product_concepts_id_fk" FOREIGN KEY ("product_concept_id") REFERENCES "public"."product_concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_product_concept_id_product_concepts_id_fk" FOREIGN KEY ("product_concept_id") REFERENCES "public"."product_concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_store_section_foreign_key" FOREIGN KEY ("store_id","aisle_section_id") REFERENCES "public"."aisle_sections"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_product_concept_id_product_concepts_id_fk" FOREIGN KEY ("product_concept_id") REFERENCES "public"."product_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_store_list_foreign_key" FOREIGN KEY ("store_id","shopping_list_id") REFERENCES "public"."shopping_lists"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_store_location_foreign_key" FOREIGN KEY ("store_id","resolved_location_id") REFERENCES "public"."product_locations"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_store_connection_foreign_key" FOREIGN KEY ("store_id","source_connection_id") REFERENCES "public"."source_connections"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_store_list_foreign_key" FOREIGN KEY ("store_id","shopping_list_id") REFERENCES "public"."shopping_lists"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_store_connection_foreign_key" FOREIGN KEY ("store_id","source_connection_id") REFERENCES "public"."source_connections"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aisle_sections_store_path_order_index" ON "aisle_sections" USING btree ("store_id","path_order");--> statement-breakpoint
CREATE INDEX "aisles_store_route_order_index" ON "aisles" USING btree ("store_id","route_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_global_normalized_text_unique" ON "product_aliases" USING btree ("normalized_text") WHERE "product_aliases"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_store_normalized_text_unique" ON "product_aliases" USING btree ("store_id","normalized_text") WHERE "product_aliases"."scope" = 'store';--> statement-breakpoint
CREATE INDEX "product_aliases_lookup_index" ON "product_aliases" USING btree ("normalized_text","store_id");--> statement-breakpoint
CREATE INDEX "product_locations_product_store_index" ON "product_locations" USING btree ("product_concept_id","store_id");--> statement-breakpoint
CREATE INDEX "product_locations_section_position_index" ON "product_locations" USING btree ("aisle_section_id","position_within_section");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_items_list_source_identifier_unique" ON "shopping_items" USING btree ("shopping_list_id","source_identifier") WHERE "shopping_items"."source_identifier" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shopping_items_active_list_read_index" ON "shopping_items" USING btree ("shopping_list_id","is_checked","order_key");--> statement-breakpoint
CREATE INDEX "shopping_items_normalized_text_index" ON "shopping_items" USING btree ("normalized_text");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_lists_one_active_per_store" ON "shopping_lists" USING btree ("store_id") WHERE "shopping_lists"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_lists_source_external_id_unique" ON "shopping_lists" USING btree ("source_connection_id","external_id") WHERE "shopping_lists"."source_connection_id" IS NOT NULL AND "shopping_lists"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shopping_lists_active_store_index" ON "shopping_lists" USING btree ("store_id","updated_at") WHERE "shopping_lists"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "source_connections_store_provider_account_unique" ON "source_connections" USING btree ("store_id","provider","external_account_id") WHERE "source_connections"."external_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sync_operations_list_status_index" ON "sync_operations" USING btree ("shopping_list_id","status","created_at");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_name_not_blank" CHECK (length(btrim("stores"."name")) > 0);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_version_positive" CHECK ("stores"."version" > 0);