# WhatsApp (Evolution API) setup

One Evolution instance / one number is shared by web + supplier + admin for
sending. Only **admin** receives (hosts the webhook + inbox).

## 1. Worker secrets (run with CLOUDFLARE_ACCOUNT_ID set — see deploy notes)

All three apps (send):

```bash
wrangler secret put EVOLUTION_API_URL      # https://<your-evolution-host>
wrangler secret put EVOLUTION_API_KEY
wrangler secret put EVOLUTION_INSTANCE
```

(run inside apps/web, apps/supplier, apps/admin)

Admin only (receive + media):

```bash
cd apps/admin
wrangler secret put WHATSAPP_WEBHOOK_SECRET   # long random string, e.g. openssl rand -hex 24
wrangler secret put SUPABASE_SERVICE_ROLE_KEY # if not already set
```

## 2. Supabase Storage

Create a PUBLIC bucket named `whatsapp-media`.

## 3. Migration (manual — prod journal is drifted)

Apply `packages/db/migrations/0018_whatsapp_inbox.sql` against DIRECT_DATABASE_URL
(e.g. `psql "$DIRECT_DATABASE_URL" -f packages/db/migrations/0018_whatsapp_inbox.sql`),
then verify:

```sql
select to_regclass('public.whatsapp_conversations'),
       to_regclass('public.whatsapp_messages');
```

## 4. Register the webhook on the Evolution instance (one-time)

Confirm the field shape against your Evolution version first (v1 vs v2 differ).
Common (Evolution v2):

```bash
curl -X POST "$EVOLUTION_API_URL/webhook/set/$EVOLUTION_INSTANCE" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,
       "url":"https://admin.flowermarket.lk/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>",
       "webhookByEvents":false,"base64":true,
       "events":["MESSAGES_UPSERT"]}}'
```

Verify:

```bash
curl "$EVOLUTION_API_URL/webhook/find/$EVOLUTION_INSTANCE" -H "apikey: $EVOLUTION_API_KEY"
```

## 5. Local dev

Put real values in apps/{web,supplier,admin}/.dev.vars (same keys). For admin
also set WHATSAPP_WEBHOOK_SECRET and VITE_SUPABASE_URL. Use a tunnel (cloudflared
/ ngrok) if you want to receive webhooks locally.
