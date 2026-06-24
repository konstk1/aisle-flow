ALTER TABLE "aisles" ADD COLUMN "display_order" integer;--> statement-breakpoint
WITH ordered_aisles AS (
	SELECT
		"aisles"."id",
		row_number() OVER (
			PARTITION BY "aisles"."store_id"
			ORDER BY min("aisle_sections"."path_order") NULLS LAST, "aisles"."identifier", "aisles"."id"
		) - 1 AS "display_order"
	FROM "aisles"
	LEFT JOIN "aisle_sections" ON "aisle_sections"."aisle_id" = "aisles"."id"
	GROUP BY "aisles"."id", "aisles"."store_id", "aisles"."identifier"
)
UPDATE "aisles"
SET "display_order" = ordered_aisles."display_order"
FROM ordered_aisles
WHERE "aisles"."id" = ordered_aisles."id";--> statement-breakpoint
ALTER TABLE "aisles" ALTER COLUMN "display_order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_store_display_order_unique" UNIQUE("store_id","display_order");--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_display_order_non_negative" CHECK ("aisles"."display_order" >= 0);
