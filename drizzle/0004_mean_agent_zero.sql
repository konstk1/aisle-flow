ALTER TABLE "session" ADD COLUMN "can_manage_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Existing sessions predate password login and were created by Google (or the local dev login).
UPDATE "session" SET "can_manage_password" = true;
