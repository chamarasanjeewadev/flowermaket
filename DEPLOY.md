# Deploying FlowerMarket.lk

Checklist for going live. Order matters.

## 1. Supabase (once)

1. Create a project (region **ap-south-1 / Mumbai** — closest to Colombo).
2. Copy connection strings (Dashboard → Connect):
   - Transaction pooler (port **6543**) → `DATABASE_URL` (app runtime)
   - Session pooler (port **5432**) → `DIRECT_DATABASE_URL` (migrations / seed only — never use the transaction pooler for drizzle-kit)
3. Copy API credentials (Dashboard → Project Settings → API):
   - `SUPABASE_URL` — the project URL
   - `SUPABASE_ANON_KEY` — the `anon` public key
4. In the repo root, create `.env` from `.env.example` and fill in the four Supabase/DB
   values (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`,
   `DIRECT_DATABASE_URL`); the three PayHere values are Phase 2 and can stay empty.
5. Run migrations and seed:

   ```sh
   set -a; source .env; set +a
   pnpm db:migrate    # applies 0000 (schema + enums) and 0001 (RLS policies + triggers)
   pnpm db:seed       # inserts the 7 flower categories (safe to re-run — idempotent)
   # optional: seed a demo shop + 3 demo products for local testing
   SEED_DEMO=1 pnpm db:seed
   ```

6. Create your admin account:
   - Sign up through the web app (`/en/signup`) or via Dashboard → Authentication → Add user.
   - Then promote it via SQL:
     ```sql
     update public.users set role = 'admin' where email = 'you@example.com';
     ```
7. Enable Google OAuth (optional):
   - Dashboard → Authentication → Providers → Google → enable, paste OAuth client ID + secret.
   - The web app's "Continue with Google" button starts working immediately.

## 2. Local development

```sh
cp .env.example .env   # fill in the Supabase/DB values from step 1
pnpm install
pnpm dev               # turbo starts all three apps:
                       #   web      → http://localhost:3000
                       #   supplier → http://localhost:3001
                       #   admin    → http://localhost:3002
```

For local dev without a live Supabase project, set `AUTH_DISABLED=1` in `.env`
(see `.env.example`). This opts in to auth-disabled dev mode (no accounts, auth
redirects skipped). Without either Supabase credentials OR `AUTH_DISABLED=1` the
apps fail closed — portals show a configuration error and deny access.

## 3. Cloudflare (per app)

```sh
pnpm exec wrangler login          # or export CLOUDFLARE_API_TOKEN=…

# apps/web
cd apps/web
pnpm exec wrangler secret put DATABASE_URL        # transaction pooler URL (port 6543)
pnpm exec wrangler secret put SUPABASE_URL        # VITE_SUPABASE_URL value (without VITE_ prefix)
pnpm exec wrangler secret put SUPABASE_ANON_KEY   # VITE_SUPABASE_ANON_KEY value
pnpm exec wrangler secret put SITE_URL            # e.g. https://flowermarket.lk
# Phase 2 (payments) — set now or later:
pnpm exec wrangler secret put PAYHERE_MERCHANT_ID
pnpm exec wrangler secret put PAYHERE_MERCHANT_SECRET
# pnpm exec wrangler secret put PAYHERE_MODE      # omit for sandbox (default) or set to "live"

# apps/supplier
cd ../supplier
pnpm exec wrangler secret put DATABASE_URL
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_ANON_KEY
pnpm exec wrangler secret put SITE_URL            # e.g. https://supplier.flowermarket.lk

# apps/admin
cd ../admin
pnpm exec wrangler secret put DATABASE_URL
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_ANON_KEY
pnpm exec wrangler secret put SITE_URL            # e.g. https://admin.flowermarket.lk
```

Deploy (from repo root):

```sh
pnpm deploy:web
pnpm deploy:supplier
pnpm deploy:admin
```

### Custom domains & DNS

Custom domains are declared **in each app's `wrangler.jsonc`** (`routes` with
`custom_domain: true`), so `wrangler deploy` provisions the DNS record + TLS cert
automatically — no dashboard clicking. Each config also sets `workers_dev: false`, which
turns off the `*.workers.dev` URL so the custom hostname is the only public entry point.

| App      | Domain                    | Managed by                          |
|----------|---------------------------|-------------------------------------|
| web      | flowermarket.lk           | `apps/web/wrangler.jsonc`           |
| web      | www.flowermarket.lk       | zone Single Redirect (301 → apex)   |
| supplier | supplier.flowermarket.lk  | `apps/supplier/wrangler.jsonc`      |
| admin    | admin.flowermarket.lk     | `apps/admin/wrangler.jsonc`         |

Prerequisites & remaining zone-level steps (once, on the `flowermarket.lk` zone):

- The `flowermarket.lk` zone must already be in the deploy Cloudflare account with its
  nameservers delegated. If the apex has a pre-existing A/AAAA/CNAME record, delete it
  first — otherwise wrangler's custom-domain attach errors. Cert issuance takes a few
  minutes after the first deploy.
- **www → apex:** add a **proxied** (orange-cloud) DNS record `CNAME www → flowermarket.lk`,
  then a **Single Redirect rule** — when hostname equals `www.flowermarket.lk`, 301 to
  `https://flowermarket.lk/${http.request.uri.path}` (preserve query string).
- **Cloudflare Access** (Zero Trust → Access → Applications) — the supplier and admin apps
  serve `noindex` / `noindex,nofollow`; gate them at the edge in addition to app auth:
  - self-hosted app `supplier.flowermarket.lk` → policy for supplier/admin operator emails.
  - self-hosted app `admin.flowermarket.lk` → policy restricted to admin emails only.
  (Because `workers_dev: false` closes the `*.workers.dev` bypass, Access on the custom
  hostname fully covers each portal.)

For local dev against the live database, put the same variables (without `VITE_` prefix
for `SUPABASE_URL` / `SUPABASE_ANON_KEY`) in `apps/web/.dev.vars`, `apps/supplier/.dev.vars`,
and `apps/admin/.dev.vars` (create from wrangler's dev.vars convention; these files are
`.gitignore`d).

## 4. Post-deploy smoke test

1. Open `https://flowermarket.lk` — should redirect to `/en/`.
2. Open `https://flowermarket.lk/si` — heading and nav should appear in Sinhala.
3. Open `https://supplier.flowermarket.lk` — unauthenticated → redirects to `/login`.
4. Open `https://admin.flowermarket.lk` — unauthenticated → redirects to `/login`.
5. Sign in on the supplier portal as the promoted admin account, confirm dashboard loads.

## Notes / gotchas

- **Never** run migrations over the transaction pooler (port 6543) — always use `DIRECT_DATABASE_URL` (port 5432).
- Workers runtime: each app creates one short-lived Postgres connection per request
  (`max: 1, prepare: false`) — this is by design for the transaction pooler; don't add pooling.
- Env vars on Cloudflare Workers must **never** be read at module top level — `getEnv()` in
  `packages/api/src/env.ts` is the correct way; always call it inside a request handler or
  server function.
- PayHere integration ships the typed surface in Phase 0. The MD5 checkout hash helpers land
  in Phase 2. `PAYHERE_MODE=sandbox` is the default; only flip to `live` after completing
  PayHere's merchant approval.
- The seed is idempotent — re-running never duplicates rows.
- The Workers runtime reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` (no `VITE_` prefix) —
  these are set as Wrangler secrets (see §3 above). The same names are used in `.env` for
  local development.
