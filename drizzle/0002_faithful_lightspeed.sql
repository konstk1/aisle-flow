CREATE TYPE "public"."aisle_traversal_direction" AS ENUM('forward', 'reverse');--> statement-breakpoint
ALTER TABLE "aisle_sections" DROP CONSTRAINT "aisle_sections_store_path_order_unique";--> statement-breakpoint
DROP INDEX "aisle_sections_store_path_order_index";--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD COLUMN "section_order" integer;--> statement-breakpoint
ALTER TABLE "aisles" ADD COLUMN "route_order" integer;--> statement-breakpoint
ALTER TABLE "aisles" ADD COLUMN "traversal_direction" "aisle_traversal_direction" DEFAULT 'forward' NOT NULL;--> statement-breakpoint
WITH ordered_aisles AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "store_id" ORDER BY "identifier", "id"
	) - 1 AS "route_order"
	FROM "aisles"
)
UPDATE "aisles"
SET "route_order" = ordered_aisles."route_order"
FROM ordered_aisles
WHERE "aisles"."id" = ordered_aisles."id";--> statement-breakpoint
WITH ordered_sections AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "aisle_id" ORDER BY "path_order", "id"
	) - 1 AS "section_order"
	FROM "aisle_sections"
)
UPDATE "aisle_sections"
SET "section_order" = ordered_sections."section_order"
FROM ordered_sections
WHERE "aisle_sections"."id" = ordered_sections."id";--> statement-breakpoint
ALTER TABLE "aisle_sections" ALTER COLUMN "section_order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "aisles" ALTER COLUMN "route_order" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "aisle_sections_aisle_path_order_index" ON "aisle_sections" USING btree ("aisle_id","path_order");--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_aisle_section_order_unique" UNIQUE("aisle_id","section_order");--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_aisle_path_order_unique" UNIQUE("aisle_id","path_order");--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_store_route_order_unique" UNIQUE("store_id","route_order");--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_section_order_non_negative" CHECK ("aisle_sections"."section_order" >= 0);--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_route_order_non_negative" CHECK ("aisles"."route_order" >= 0);
