ALTER TABLE "shops" ADD COLUMN "is_aggregator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "verification_notes" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "verification_proof" jsonb;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "verification_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "verification_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "verification_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_verification_reviewed_by_users_id_fk" FOREIGN KEY ("verification_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;