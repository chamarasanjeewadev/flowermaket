-- WhatsApp inbox: conversations + messages. Idempotent (prod journal is drifted).
DO $$ BEGIN
  CREATE TYPE "whatsapp_direction" AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "whatsapp_message_kind" AS ENUM ('text', 'image', 'audio', 'document', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "whatsapp_message_status" AS ENUM ('received', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "remote_jid" text NOT NULL,
  "phone" text NOT NULL,
  "display_name" text,
  "linked_user_id" uuid REFERENCES "users"("id"),
  "linked_shop_id" uuid REFERENCES "shops"("id"),
  "last_message_at" timestamptz DEFAULT now() NOT NULL,
  "last_preview" text,
  "unread_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_conversations_remote_jid_unique" UNIQUE ("remote_jid")
);

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE,
  "evolution_key_id" text,
  "direction" "whatsapp_direction" NOT NULL,
  "kind" "whatsapp_message_kind" DEFAULT 'text' NOT NULL,
  "text" text,
  "media_storage_path" text,
  "media_mime" text,
  "status" "whatsapp_message_status" NOT NULL,
  "remote_timestamp" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_messages_evolution_key_id_unique" UNIQUE ("evolution_key_id")
);

CREATE INDEX IF NOT EXISTS "whatsapp_conversations_last_message_idx" ON "whatsapp_conversations" ("last_message_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_conversation_idx" ON "whatsapp_messages" ("conversation_id", "created_at");

-- RLS: deny anon; service-role (webhook + admin server fns) bypasses RLS.
ALTER TABLE "whatsapp_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;

-- Grant the postgres role (the app's DB connection user) full access.
-- The postgres role on Supabase may not have BYPASSRLS (as documented in
-- migrations 0009/0010/0011), so an explicit policy is required or all
-- INSERT/SELECT/UPDATE operations return deny-all.
-- Re-runnable: IF NOT EXISTS guards make this idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_conversations'
      AND policyname = 'whatsapp_conversations_postgres_all'
  ) THEN
    EXECUTE 'CREATE POLICY "whatsapp_conversations_postgres_all" ON public.whatsapp_conversations FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_messages'
      AND policyname = 'whatsapp_messages_postgres_all'
  ) THEN
    EXECUTE 'CREATE POLICY "whatsapp_messages_postgres_all" ON public.whatsapp_messages FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
END
$$;
