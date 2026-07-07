-- Aliases move from store scope to user scope. The neon-http migrator applies
-- statements without a wrapping transaction, so every step is idempotent to
-- keep a mid-run failure re-runnable. Enum comparisons in the data steps go
-- through ::text so they parse against both the old and new enum.
ALTER TABLE "product_aliases" DROP CONSTRAINT IF EXISTS "product_aliases_scope_store_consistency";--> statement-breakpoint
ALTER TABLE "product_aliases" DROP CONSTRAINT IF EXISTS "product_aliases_store_id_stores_id_fk";--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
UPDATE "product_aliases" SET "user_id" = attribution."created_by_user_id"
FROM (
	SELECT DISTINCT ON ("store_id", "normalized_text") "store_id", "normalized_text", "created_by_user_id"
	FROM "product_learning_events"
	WHERE "created_by_user_id" IS NOT NULL
	ORDER BY "store_id", "normalized_text", "created_at" DESC
) attribution
WHERE "product_aliases"."scope"::text = 'store'
	AND "product_aliases"."user_id" IS NULL
	AND "product_aliases"."store_id" = attribution."store_id"
	AND "product_aliases"."normalized_text" = attribution."normalized_text";--> statement-breakpoint
DELETE FROM "product_aliases"
USING "product_aliases" newer
WHERE "product_aliases"."scope"::text = 'store'
	AND newer."scope"::text = 'store'
	AND "product_aliases"."user_id" IS NOT NULL
	AND newer."user_id" = "product_aliases"."user_id"
	AND newer."normalized_text" = "product_aliases"."normalized_text"
	AND (newer."updated_at" > "product_aliases"."updated_at"
		OR (newer."updated_at" = "product_aliases"."updated_at" AND newer."id" > "product_aliases"."id"));--> statement-breakpoint
DELETE FROM "product_aliases" WHERE "scope"::text = 'store' AND "user_id" IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "product_aliases_global_normalized_text_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "product_aliases_store_normalized_text_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "product_aliases_lookup_index";--> statement-breakpoint
ALTER TABLE "product_aliases" ALTER COLUMN "scope" SET DATA TYPE text;--> statement-breakpoint
UPDATE "product_aliases" SET "scope" = 'user' WHERE "scope"::text = 'store';--> statement-breakpoint
DROP TYPE IF EXISTS "public"."product_alias_scope";--> statement-breakpoint
CREATE TYPE "public"."product_alias_scope" AS ENUM('global', 'user');--> statement-breakpoint
ALTER TABLE "product_aliases" ALTER COLUMN "scope" SET DATA TYPE "public"."product_alias_scope" USING "scope"::"public"."product_alias_scope";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_aliases_global_normalized_text_unique" ON "product_aliases" USING btree ("normalized_text") WHERE "product_aliases"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_aliases_user_normalized_text_unique" ON "product_aliases" USING btree ("user_id","normalized_text") WHERE "product_aliases"."scope" = 'user';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_aliases_lookup_index" ON "product_aliases" USING btree ("normalized_text","user_id");--> statement-breakpoint
ALTER TABLE "product_aliases" DROP CONSTRAINT IF EXISTS "product_aliases_scope_user_consistency";--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_scope_user_consistency" CHECK (("product_aliases"."scope" = 'global' AND "product_aliases"."user_id" IS NULL) OR ("product_aliases"."scope" = 'user' AND "product_aliases"."user_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "product_aliases" DROP COLUMN IF EXISTS "store_id";
