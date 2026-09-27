CREATE TYPE "public"."award_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'sent', 'viewed', 'accepted', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('quotation', 'invoice', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('whatsapp', 'phone', 'web', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'sourcing', 'quoted', 'confirmed', 'invoiced', 'paid', 'fulfilling', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('sent', 'viewed', 'quoted', 'declined', 'expired', 'awarded', 'closed');--> statement-breakpoint
CREATE TABLE "order_item_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"supplier_shop_id" uuid NOT NULL,
	"rfq_quote_line_id" uuid,
	"awarded_qty" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"status" "award_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"category_id" uuid,
	"description_en" text NOT NULL,
	"description_si" text,
	"variant" text,
	"quantity" integer NOT NULL,
	"unit" text DEFAULT 'stem' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" text NOT NULL,
	"source" "order_source" DEFAULT 'whatsapp' NOT NULL,
	"buyer_user_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"customer_locale" "language" DEFAULT 'en' NOT NULL,
	"delivery_address" text,
	"delivery_district" text,
	"delivery_city" text,
	"needed_by_date" date,
	"notes_internal" text,
	"notes_customer" text,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "rfq_quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"available_qty" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"lead_time_days" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"supplier_shop_id" uuid NOT NULL,
	"status" "rfq_status" DEFAULT 'sent' NOT NULL,
	"message" text,
	"quote_notes" text,
	"quote_valid_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"doc_no" text NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'LKR' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"delivery_fee" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"line_snapshot" jsonb NOT NULL,
	"customer_snapshot" jsonb NOT NULL,
	"notes" text,
	"valid_until" timestamp with time zone,
	"public_token" text NOT NULL,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_method" text,
	"payment_ref" text,
	"pdf_path" text,
	"superseded_by_document_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_doc_no_unique" UNIQUE("doc_no"),
	CONSTRAINT "documents_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
ALTER TABLE "order_item_awards" ADD CONSTRAINT "order_item_awards_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_awards" ADD CONSTRAINT "order_item_awards_supplier_shop_id_shops_id_fk" FOREIGN KEY ("supplier_shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_awards" ADD CONSTRAINT "order_item_awards_rfq_quote_line_id_rfq_quote_lines_id_fk" FOREIGN KEY ("rfq_quote_line_id") REFERENCES "public"."rfq_quote_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_lines" ADD CONSTRAINT "rfq_quote_lines_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_lines" ADD CONSTRAINT "rfq_quote_lines_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_supplier_shop_id_shops_id_fk" FOREIGN KEY ("supplier_shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_otps" ADD CONSTRAINT "document_otps_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_item_awards_item_idx" ON "order_item_awards" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "order_item_awards_supplier_idx" ON "order_item_awards" USING btree ("supplier_shop_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_by_idx" ON "orders" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "rfq_quote_lines_rfq_idx" ON "rfq_quote_lines" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "rfq_quote_lines_item_idx" ON "rfq_quote_lines" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfqs_order_supplier_uq" ON "rfqs" USING btree ("order_id","supplier_shop_id");--> statement-breakpoint
CREATE INDEX "rfqs_supplier_idx" ON "rfqs" USING btree ("supplier_shop_id");--> statement-breakpoint
CREATE INDEX "document_otps_doc_created_idx" ON "document_otps" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_order_idx" ON "documents" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_public_token_uq" ON "documents" USING btree ("public_token");