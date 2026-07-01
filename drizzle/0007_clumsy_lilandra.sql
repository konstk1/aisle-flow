CREATE TYPE "public"."product_learning_event_action" AS ENUM('created', 'updated', 'deleted');--> statement-breakpoint
CREATE TABLE "product_learning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"normalized_text" text NOT NULL,
	"action" "product_learning_event_action" NOT NULL,
	"product_concept_id" uuid,
	"product_concept_name" text NOT NULL,
	"aisle_section_id" uuid,
	"aisle_section_label" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_learning_events_normalized_text_not_blank" CHECK (length(btrim("product_learning_events"."normalized_text")) > 0),
	CONSTRAINT "product_learning_events_concept_name_not_blank" CHECK (length(btrim("product_learning_events"."product_concept_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "product_learning_events" ADD CONSTRAINT "product_learning_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_learning_events" ADD CONSTRAINT "product_learning_events_product_concept_id_product_concepts_id_fk" FOREIGN KEY ("product_concept_id") REFERENCES "public"."product_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_learning_events" ADD CONSTRAINT "product_learning_events_aisle_section_id_aisle_sections_id_fk" FOREIGN KEY ("aisle_section_id") REFERENCES "public"."aisle_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_learning_events" ADD CONSTRAINT "product_learning_events_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_learning_events_store_text_index" ON "product_learning_events" USING btree ("store_id","normalized_text","created_at");