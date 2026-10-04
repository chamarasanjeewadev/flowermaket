CREATE TABLE "flower_species" (
	"id" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_si" text NOT NULL,
	"local_name" text,
	"category" text NOT NULL,
	"default_unit" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flower_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"species_id" text NOT NULL,
	"color_en" text,
	"color_si" text,
	"image_path" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "flower_variant_id" text;--> statement-breakpoint
ALTER TABLE "flower_variants" ADD CONSTRAINT "flower_variants_species_id_flower_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."flower_species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flower_variants_species_id_idx" ON "flower_variants" USING btree ("species_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_flower_variant_id_flower_variants_id_fk" FOREIGN KEY ("flower_variant_id") REFERENCES "public"."flower_variants"("id") ON DELETE set null ON UPDATE no action;
