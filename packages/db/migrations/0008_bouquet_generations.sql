CREATE TABLE IF NOT EXISTS "bouquet_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid REFERENCES "public"."users"("id"),
	"ip_address" text NOT NULL,
	"flowers_json" text,
	"image_storage_path" text,
	"image_public_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bouquet_gen_user_id_idx" ON "bouquet_generations" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bouquet_gen_ip_idx" ON "bouquet_generations" ("ip_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bouquet_gen_created_at_idx" ON "bouquet_generations" ("created_at");
