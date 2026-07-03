DROP INDEX "shopping_lists_user_index";--> statement-breakpoint
ALTER TABLE "shopping_items" DROP COLUMN "sync_state";--> statement-breakpoint
ALTER TABLE "shopping_lists" DROP COLUMN "sync_state";--> statement-breakpoint
DROP TYPE "public"."synchronization_state";