CREATE TYPE "public"."aisle_section_side" AS ENUM('left', 'right', 'center', 'endcap');--> statement-breakpoint
CREATE TYPE "public"."product_alias_scope" AS ENUM('global', 'user');--> statement-breakpoint
CREATE TYPE "public"."product_alias_source" AS ENUM('curated', 'learned', 'imported');--> statement-breakpoint
CREATE TYPE "public"."product_location_source" AS ENUM('curated', 'manual', 'inferred', 'imported');--> statement-breakpoint
CREATE TYPE "public"."shopping_item_categorization_source" AS ENUM('learned-alias', 'llm', 'deterministic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."shopping_list_source" AS ENUM('manual', 'import', 'provider');--> statement-breakpoint
CREATE TYPE "public"."shopping_list_state" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "aisle_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"aisle_id" uuid NOT NULL,
	"label" text,
	"path_order" integer NOT NULL,
	"side" "aisle_section_side" DEFAULT 'center' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aisle_sections_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "aisle_sections_store_path_order_unique" UNIQUE("store_id","path_order"),
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
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aisles_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "aisles_store_identifier_unique" UNIQUE("store_id","identifier"),
	CONSTRAINT "aisles_store_display_order_unique" UNIQUE("store_id","display_order"),
	CONSTRAINT "aisles_identifier_not_blank" CHECK (length(btrim("aisles"."identifier")) > 0),
	CONSTRAINT "aisles_display_order_non_negative" CHECK ("aisles"."display_order" >= 0),
	CONSTRAINT "aisles_version_positive" CHECK ("aisles"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_concept_id" uuid NOT NULL,
	"user_id" text,
	"normalized_text" text NOT NULL,
	"scope" "product_alias_scope" NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"source" "product_alias_source" DEFAULT 'curated' NOT NULL,
	"is_correction" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_aliases_scope_user_consistency" CHECK (("product_aliases"."scope" = 'global' AND "product_aliases"."user_id" IS NULL) OR ("product_aliases"."scope" = 'user' AND "product_aliases"."user_id" IS NOT NULL)),
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
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopping_list_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"quantity_text" text,
	"product_concept_id" uuid,
	"categorization_source" "shopping_item_categorization_source",
	"suggested_product_concept_name" text,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"order_key" text NOT NULL,
	"source_identifier" text,
	"mutation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_items_list_mutation_id_unique" UNIQUE("shopping_list_id","mutation_id"),
	CONSTRAINT "shopping_items_raw_text_not_blank" CHECK (length(btrim("shopping_items"."raw_text")) > 0),
	CONSTRAINT "shopping_items_normalized_text_not_blank" CHECK (length(btrim("shopping_items"."normalized_text")) > 0),
	CONSTRAINT "shopping_items_quantity_text_valid" CHECK ("shopping_items"."quantity_text" IS NULL OR (length(btrim("shopping_items"."quantity_text")) > 0 AND length("shopping_items"."quantity_text") <= 40)),
	CONSTRAINT "shopping_items_suggested_product_concept_name_valid" CHECK ("shopping_items"."suggested_product_concept_name" IS NULL OR (length(btrim("shopping_items"."suggested_product_concept_name")) > 0 AND length("shopping_items"."suggested_product_concept_name") <= 80)),
	CONSTRAINT "shopping_items_order_key_not_blank" CHECK (length(btrim("shopping_items"."order_key")) > 0),
	CONSTRAINT "shopping_items_checked_at_consistency" CHECK (("shopping_items"."is_checked" = false AND "shopping_items"."checked_at" IS NULL) OR ("shopping_items"."is_checked" = true AND "shopping_items"."checked_at" IS NOT NULL)),
	CONSTRAINT "shopping_items_version_positive" CHECK ("shopping_items"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"state" "shopping_list_state" DEFAULT 'active' NOT NULL,
	"source" "shopping_list_source" DEFAULT 'manual' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_lists_version_positive" CHECK ("shopping_lists"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_name_not_blank" CHECK (length(btrim("stores"."name")) > 0),
	CONSTRAINT "stores_version_positive" CHECK ("stores"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"current_store_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_name_not_blank" CHECK (length(btrim("user"."name")) > 0),
	CONSTRAINT "user_email_not_blank" CHECK (length(btrim("user"."email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_identifier_not_blank" CHECK (length(btrim("verification"."identifier")) > 0),
	CONSTRAINT "verification_value_not_blank" CHECK (length(btrim("verification"."value")) > 0)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_store_aisle_foreign_key" FOREIGN KEY ("store_id","aisle_id") REFERENCES "public"."aisles"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_concept_id_product_concepts_id_fk" FOREIGN KEY ("product_concept_id") REFERENCES "public"."product_concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_product_concept_id_product_concepts_id_fk" FOREIGN KEY ("product_concept_id") REFERENCES "public"."product_concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_store_section_foreign_key" FOREIGN KEY ("store_id","aisle_section_id") REFERENCES "public"."aisle_sections"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_shopping_list_id_shopping_lists_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_product_concept_id_product_concepts_id_fk" FOREIGN KEY ("product_concept_id") REFERENCES "public"."product_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_current_store_id_stores_id_fk" FOREIGN KEY ("current_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aisle_sections_store_path_order_index" ON "aisle_sections" USING btree ("store_id","path_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_global_normalized_text_unique" ON "product_aliases" USING btree ("normalized_text") WHERE "product_aliases"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_user_normalized_text_unique" ON "product_aliases" USING btree ("user_id","normalized_text") WHERE "product_aliases"."scope" = 'user';--> statement-breakpoint
CREATE INDEX "product_aliases_lookup_index" ON "product_aliases" USING btree ("normalized_text","user_id");--> statement-breakpoint
CREATE INDEX "product_locations_section_position_index" ON "product_locations" USING btree ("aisle_section_id","position_within_section");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_items_list_source_identifier_unique" ON "shopping_items" USING btree ("shopping_list_id","source_identifier") WHERE "shopping_items"."source_identifier" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shopping_items_active_list_read_index" ON "shopping_items" USING btree ("shopping_list_id","is_checked","order_key");--> statement-breakpoint
CREATE INDEX "shopping_items_snoozed_index" ON "shopping_items" USING btree ("shopping_list_id","snoozed_until") WHERE "shopping_items"."snoozed_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shopping_items_normalized_text_index" ON "shopping_items" USING btree ("normalized_text");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_lists_one_active_per_user" ON "shopping_lists" USING btree ("user_id") WHERE "shopping_lists"."state" = 'active';--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");