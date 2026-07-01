CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_name_not_blank" CHECK (length(btrim("user"."name")) > 0),
	CONSTRAINT "user_email_not_blank" CHECK (length(btrim("user"."email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_identifier_not_blank" CHECK (length(btrim("verification"."identifier")) > 0),
	CONSTRAINT "verification_value_not_blank" CHECK (length(btrim("verification"."value")) > 0)
);
--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD COLUMN "user_id" text;--> statement-breakpoint
INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
VALUES ('initial-owner-kon-klitenik', 'Kon', 'kon.klitenik@gmail.com', true, now(), now())
ON CONFLICT ("email") DO UPDATE SET
	"name" = excluded."name",
	"email_verified" = true,
	"updated_at" = now();--> statement-breakpoint
UPDATE "shopping_lists"
SET "user_id" = (
	SELECT "id"
	FROM "user"
	WHERE "email" = 'kon.klitenik@gmail.com'
	LIMIT 1
)
WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "shopping_lists" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "shopping_lists_one_active_per_store";--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_lists_one_active_per_user_store" ON "shopping_lists" USING btree ("user_id","store_id") WHERE "shopping_lists"."state" = 'active';--> statement-breakpoint
CREATE INDEX "shopping_lists_user_store_index" ON "shopping_lists" USING btree ("user_id","store_id");
