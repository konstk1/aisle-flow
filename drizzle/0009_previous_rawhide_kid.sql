-- Shopping lists become per-user (issue #39). Each user keeps the lists of a
-- single store — their current store when set, otherwise the store of their
-- most recently updated active list — and lists for other stores are deleted
-- (items cascade via the still-present composite foreign key).
WITH "kept" AS (
	SELECT DISTINCT ON ("sl"."user_id") "sl"."user_id", "sl"."store_id"
	FROM "shopping_lists" "sl"
	LEFT JOIN "user" "u" ON "u"."id" = "sl"."user_id"
	ORDER BY "sl"."user_id",
		("sl"."store_id" = "u"."current_store_id") DESC NULLS LAST,
		("sl"."state" = 'active') DESC,
		"sl"."updated_at" DESC
)
DELETE FROM "shopping_lists" "sl"
USING "kept"
WHERE "sl"."user_id" = "kept"."user_id"
	AND "sl"."store_id" <> "kept"."store_id";--> statement-breakpoint
DROP TABLE IF EXISTS "source_connections" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sync_operations" CASCADE;--> statement-breakpoint
-- Dependent foreign keys must go before the composite unique constraints they
-- reference; the migration is also re-runnable from a partial failure, hence
-- the IF EXISTS guards.
ALTER TABLE "shopping_items" DROP CONSTRAINT IF EXISTS "shopping_items_store_list_foreign_key";--> statement-breakpoint
ALTER TABLE "shopping_items" DROP CONSTRAINT IF EXISTS "shopping_items_store_location_foreign_key";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP CONSTRAINT IF EXISTS "shopping_lists_store_connection_foreign_key";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP CONSTRAINT IF EXISTS "shopping_lists_store_id_id_unique";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP CONSTRAINT IF EXISTS "shopping_lists_provider_connection_consistency";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP CONSTRAINT IF EXISTS "shopping_lists_store_id_stores_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "shopping_lists_one_active_per_user_store";--> statement-breakpoint
DROP INDEX IF EXISTS "shopping_lists_source_external_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "shopping_lists_active_store_index";--> statement-breakpoint
DROP INDEX IF EXISTS "shopping_lists_user_store_index";--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_shopping_list_id_shopping_lists_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_lists_one_active_per_user" ON "shopping_lists" USING btree ("user_id") WHERE "shopping_lists"."state" = 'active';--> statement-breakpoint
CREATE INDEX "shopping_lists_user_index" ON "shopping_lists" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "shopping_items" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "shopping_items" DROP COLUMN "resolved_location_id";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP COLUMN "source_connection_id";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP COLUMN "sync_cursor";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP COLUMN "last_synced_at";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."source_connection_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."sync_direction";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."sync_operation_status";
