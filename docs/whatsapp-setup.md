# WhatsApp (Evolution GO) setup

We run **Evolution GO** (https://evolution.grittech.lk, manager at `/manager`),
not Evolution API v2. GO authenticates messaging calls with the **instance
token** in the `apikey` header and has no instance name in the URL:
`POST /send/text`, `GET /instance/status`. The admin invite screen shows the
live connection state from `/instance/status`.

One Evolution instance / one number is shared by web + supplier + admin for
sending. Only **admin** receives (hosts the webhook + inbox).

## 1. Worker secrets (run with CLOUDFLARE_ACCOUNT_ID set — see deploy notes)

All three apps (send):

```bash
wrangler secret put EVOLUTION_API_URL      # https://evolution.grittech.lk
wrangler secret put EVOLUTION_API_KEY      # the INSTANCE token (manager → instance → Token da Instância)
wrangler secret put EVOLUTION_INSTANCE     # instance name, informational (e.g. sda)
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

## 4. Register the webhook on the Evolution GO instance (one-time)

In the Evolution GO manager → instance → Configurações → Webhook, set the URL to
either form (the secret is compared in constant time):

- `https://admin.flowermarket.lk/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>`
- `https://admin.flowermarket.lk/api/whatsapp/webhook/<instance>?token=<WHATSAPP_WEBHOOK_SECRET>`

Enable the **MESSAGE** event. For inbound photos, the GO server needs
`WEBHOOK_FILES=true` (media then arrives as `data.Message.base64`).

Check the instance is connected:

```bash
curl https://evolution.grittech.lk/instance/status -H "apikey: <instance token>"
# {"data":{"Connected":true,"LoggedIn":true,...}}
```

## 5. Local dev

Put real values in apps/{web,supplier,admin}/.dev.vars (same keys). For admin
also set WHATSAPP_WEBHOOK_SECRET and VITE_SUPABASE_URL. Use a tunnel (cloudflared
/ ngrok) if you want to receive webhooks locally.
