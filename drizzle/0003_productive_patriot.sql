ALTER TABLE "aisle_sections" DROP CONSTRAINT "aisle_sections_aisle_section_order_unique";--> statement-breakpoint
ALTER TABLE "aisle_sections" DROP CONSTRAINT "aisle_sections_aisle_path_order_unique";--> statement-breakpoint
ALTER TABLE "aisles" DROP CONSTRAINT "aisles_store_route_order_unique";--> statement-breakpoint
ALTER TABLE "aisle_sections" DROP CONSTRAINT "aisle_sections_section_order_non_negative";--> statement-breakpoint
ALTER TABLE "aisles" DROP CONSTRAINT "aisles_route_order_non_negative";--> statement-breakpoint
DROP INDEX "aisle_sections_aisle_path_order_index";--> statement-breakpoint
WITH ordered_sections AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "store_id" ORDER BY "path_order", "aisle_id", "id"
	) - 1 AS "path_order"
	FROM "aisle_sections"
)
UPDATE "aisle_sections"
SET "path_order" = ordered_sections."path_order"
FROM ordered_sections
WHERE "aisle_sections"."id" = ordered_sections."id";--> statement-breakpoint
CREATE INDEX "aisle_sections_store_path_order_index" ON "aisle_sections" USING btree ("store_id","path_order");--> statement-breakpoint
ALTER TABLE "aisle_sections" DROP COLUMN "section_order";--> statement-breakpoint
ALTER TABLE "aisles" DROP COLUMN "route_order";--> statement-breakpoint
ALTER TABLE "aisles" DROP COLUMN "traversal_direction";--> statement-breakpoint
ALTER TABLE "aisle_sections" ADD CONSTRAINT "aisle_sections_store_path_order_unique" UNIQUE("store_id","path_order");--> statement-breakpoint
DROP TYPE "public"."aisle_traversal_direction";
