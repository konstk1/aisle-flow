ALTER TABLE "product_locations" DROP CONSTRAINT "product_locations_position_non_negative";--> statement-breakpoint
DROP INDEX "product_locations_section_position_index";--> statement-breakpoint
ALTER TABLE "product_locations" DROP COLUMN "position_within_section";