ALTER TABLE "product_concepts" DROP CONSTRAINT "product_concepts_normalized_name_unique";--> statement-breakpoint
ALTER TABLE "product_locations" DROP CONSTRAINT "product_locations_store_id_id_unique";--> statement-breakpoint
ALTER TABLE "product_locations" DROP CONSTRAINT "product_locations_store_product_concept_unique";--> statement-breakpoint
ALTER TABLE "product_aliases" DROP CONSTRAINT "product_aliases_scope_user_consistency";--> statement-breakpoint
ALTER TABLE "product_aliases" DROP CONSTRAINT "product_aliases_product_concept_id_product_concepts_id_fk";--> statement-breakpoint
ALTER TABLE "product_aliases" DROP CONSTRAINT "product_aliases_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "product_locations" DROP CONSTRAINT "product_locations_product_concept_id_product_concepts_id_fk";--> statement-breakpoint
DROP INDEX "product_aliases_global_normalized_text_unique";--> statement-breakpoint
DROP INDEX "product_aliases_user_normalized_text_unique";--> statement-breakpoint
ALTER TABLE "product_aliases" ALTER COLUMN "scope" SET DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN "seed_key" text;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN "display_text" text;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_concepts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "product_concepts" ADD COLUMN "seed_key" text;--> statement-breakpoint
ALTER TABLE "product_concepts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_locations" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "product_catalog_seed_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TABLE "_issue_41_product_concept_user_map" (
  "old_id" uuid NOT NULL,
  "new_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "seed_key" text,
  PRIMARY KEY ("old_id", "user_id")
);--> statement-breakpoint

INSERT INTO "_issue_41_product_concept_user_map" ("old_id", "new_id", "user_id", "seed_key")
SELECT
  "product_concepts"."id",
  gen_random_uuid(),
  "user"."id",
  CASE
    WHEN "product_concepts"."normalized_name" IN (
      'apple sauce', 'beans', 'butter', 'canned vegetables', 'cereal',
      'cheese', 'chips', 'coffee', 'dairy', 'deli', 'fish',
      'frozen breakfast', 'frozen vegetables', 'grains', 'granola',
      'ice cream', 'juice', 'meat', 'nuts', 'orange juice', 'pancakes',
      'paper goods', 'pasta', 'produce', 'rice', 'seasoning', 'tea',
      'vinegar', 'water', 'yogurt'
    ) THEN "product_concepts"."normalized_name"
    ELSE NULL
  END
FROM "product_concepts"
CROSS JOIN "user";--> statement-breakpoint

INSERT INTO "product_concepts" (
  "id", "user_id", "seed_key", "canonical_name", "normalized_name",
  "excluded_terms", "version", "created_at", "updated_at"
)
SELECT
  "_issue_41_product_concept_user_map"."new_id",
  "_issue_41_product_concept_user_map"."user_id",
  "_issue_41_product_concept_user_map"."seed_key",
  "product_concepts"."canonical_name",
  "product_concepts"."normalized_name",
  "product_concepts"."excluded_terms",
  "product_concepts"."version",
  "product_concepts"."created_at",
  "product_concepts"."updated_at"
FROM "_issue_41_product_concept_user_map"
JOIN "product_concepts"
  ON "product_concepts"."id" = "_issue_41_product_concept_user_map"."old_id";--> statement-breakpoint

UPDATE "product_aliases"
SET
  "product_concept_id" = "_issue_41_product_concept_user_map"."new_id",
  "seed_key" = CASE
    WHEN "product_aliases"."source" = 'curated'
      AND "_issue_41_product_concept_user_map"."seed_key" IS NOT NULL
    THEN "_issue_41_product_concept_user_map"."seed_key" || ':' || "product_aliases"."normalized_text"
    ELSE NULL
  END,
  "display_text" = "product_aliases"."normalized_text",
  "scope" = 'user'
FROM "_issue_41_product_concept_user_map"
WHERE
  "product_aliases"."user_id" = "_issue_41_product_concept_user_map"."user_id"
  AND "product_aliases"."product_concept_id" = "_issue_41_product_concept_user_map"."old_id";--> statement-breakpoint

INSERT INTO "product_aliases" (
  "id", "product_concept_id", "user_id", "seed_key", "display_text",
  "normalized_text", "scope", "confidence", "source", "is_correction",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  "_issue_41_product_concept_user_map"."new_id",
  "_issue_41_product_concept_user_map"."user_id",
  CASE
    WHEN "product_aliases"."source" = 'curated'
      AND "_issue_41_product_concept_user_map"."seed_key" IS NOT NULL
    THEN "_issue_41_product_concept_user_map"."seed_key" || ':' || "product_aliases"."normalized_text"
    ELSE NULL
  END,
  "product_aliases"."normalized_text",
  "product_aliases"."normalized_text",
  'user',
  "product_aliases"."confidence",
  "product_aliases"."source",
  "product_aliases"."is_correction",
  "product_aliases"."created_at",
  "product_aliases"."updated_at"
FROM "product_aliases"
JOIN "_issue_41_product_concept_user_map"
  ON "product_aliases"."product_concept_id" = "_issue_41_product_concept_user_map"."old_id"
WHERE
  "product_aliases"."scope" = 'global'
  AND NOT EXISTS (
    SELECT 1
    FROM "product_aliases" AS "personal_alias"
    WHERE
      "personal_alias"."user_id" = "_issue_41_product_concept_user_map"."user_id"
      AND "personal_alias"."normalized_text" = "product_aliases"."normalized_text"
  );--> statement-breakpoint

DELETE FROM "product_aliases" WHERE "user_id" IS NULL;--> statement-breakpoint

INSERT INTO "product_locations" (
  "id", "user_id", "store_id", "product_concept_id", "aisle_section_id",
  "position_within_section", "confidence", "source", "version",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  "_issue_41_product_concept_user_map"."user_id",
  "product_locations"."store_id",
  "_issue_41_product_concept_user_map"."new_id",
  "product_locations"."aisle_section_id",
  "product_locations"."position_within_section",
  "product_locations"."confidence",
  "product_locations"."source",
  "product_locations"."version",
  "product_locations"."created_at",
  "product_locations"."updated_at"
FROM "product_locations"
JOIN "_issue_41_product_concept_user_map"
  ON "product_locations"."product_concept_id" = "_issue_41_product_concept_user_map"."old_id";--> statement-breakpoint

DELETE FROM "product_locations" WHERE "user_id" IS NULL;--> statement-breakpoint

UPDATE "shopping_items"
SET "product_concept_id" = "_issue_41_product_concept_user_map"."new_id"
FROM "shopping_lists", "_issue_41_product_concept_user_map"
WHERE
  "shopping_items"."shopping_list_id" = "shopping_lists"."id"
  AND "shopping_lists"."user_id" = "_issue_41_product_concept_user_map"."user_id"
  AND "shopping_items"."product_concept_id" = "_issue_41_product_concept_user_map"."old_id";--> statement-breakpoint

DELETE FROM "product_concepts" WHERE "user_id" IS NULL;--> statement-breakpoint
DROP TABLE "_issue_41_product_concept_user_map";--> statement-breakpoint

ALTER TABLE "product_aliases" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_aliases" ALTER COLUMN "display_text" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_concepts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_locations" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "product_concepts" ADD CONSTRAINT "product_concepts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_concepts" ADD CONSTRAINT "product_concepts_user_id_id_unique" UNIQUE("user_id","id");--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_user_product_concept_foreign_key" FOREIGN KEY ("user_id","product_concept_id") REFERENCES "public"."product_concepts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_user_product_concept_foreign_key" FOREIGN KEY ("user_id","product_concept_id") REFERENCES "public"."product_concepts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_user_seed_key_unique" ON "product_aliases" USING btree ("user_id","seed_key") WHERE "product_aliases"."seed_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_user_active_normalized_text_unique" ON "product_aliases" USING btree ("user_id","normalized_text") WHERE "product_aliases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_concepts_user_seed_key_unique" ON "product_concepts" USING btree ("user_id","seed_key") WHERE "product_concepts"."seed_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_concepts_user_active_normalized_name_unique" ON "product_concepts" USING btree ("user_id","normalized_name") WHERE "product_concepts"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_user_store_id_id_unique" UNIQUE("user_id","store_id","id");--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_user_store_product_concept_unique" UNIQUE("user_id","store_id","product_concept_id");--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_display_text_not_blank" CHECK (length(btrim("product_aliases"."display_text")) > 0);--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_seed_key_not_blank" CHECK ("product_aliases"."seed_key" IS NULL OR length(btrim("product_aliases"."seed_key")) > 0);--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_scope_user_consistency" CHECK ("product_aliases"."scope" = 'user');--> statement-breakpoint
ALTER TABLE "product_concepts" ADD CONSTRAINT "product_concepts_seed_key_not_blank" CHECK ("product_concepts"."seed_key" IS NULL OR length(btrim("product_concepts"."seed_key")) > 0);--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_product_catalog_seed_version_non_negative" CHECK ("user"."product_catalog_seed_version" >= 0);
