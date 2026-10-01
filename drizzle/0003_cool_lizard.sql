ALTER TABLE "shopping_items" DROP CONSTRAINT "shopping_items_checked_at_consistency";--> statement-breakpoint
DROP INDEX "shopping_items_active_list_read_index";--> statement-breakpoint
CREATE INDEX "shopping_items_active_list_read_index" ON "shopping_items" USING btree ("shopping_list_id","checked_at","order_key");--> statement-breakpoint
ALTER TABLE "shopping_items" DROP COLUMN "is_checked";