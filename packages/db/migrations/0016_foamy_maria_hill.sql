CREATE TABLE "supplier_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name_en" text,
	"shop_type" "shop_type",
	"is_aggregator" boolean DEFAULT false NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_by" uuid,
	"accepted_shop_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "supplier_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "supplier_invites" ADD CONSTRAINT "supplier_invites_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invites" ADD CONSTRAINT "supplier_invites_accepted_shop_id_shops_id_fk" FOREIGN KEY ("accepted_shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_invites_phone_idx" ON "supplier_invites" USING btree ("phone");