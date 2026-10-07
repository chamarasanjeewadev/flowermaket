# @flowers/mcp — FlowerMarket.lk MCP server

A local (stdio) MCP server that lets AI agents run the marketplace: orders and RFQs,
supplier awards, quotations/invoices/receipts, shop and product moderation, supplier invites,
and the WhatsApp inbox. It calls the same repos as the admin portal (`@flowers/api`,
`@flowers/integrations`), so business rules and order-status transitions are identical.

**It operates on production data.** The root `.env` `DATABASE_URL` is the production Supabase
pooler.

## Setup

```sh
cp packages/mcp/.env.example packages/mcp/.env   # then fill EVOLUTION_API_KEY
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | From the repo-root `.env` (production pooler). |
| `FLOWERS_ADMIN_EMAIL` | Admin account writes are attributed to (orders/documents need a real `created_by_user_id`). |
| `SUPPLIER_PORTAL_URL`, `WEB_PUBLIC_URL` | Live origins used in WhatsApp links — never localhost. |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` | Evolution GO instance token (same as the admin Worker secret). Without it, send tools fail cleanly. |
| `FLOWERS_MCP_READ_ONLY=1` | Optional: register read tools only. |
| `FLOWERS_ENV_FILES` | Optional: comma-separated env files to load instead of `packages/mcp/.env,.env`. |

Process env wins over files; the apps' `.dev.vars` are intentionally not read (they hold
localhost URLs and placeholder Evolution creds).

Claude Code picks the server up from the repo-root `.mcp.json` (server name `flowers`; tools
appear as `mcp__flowers__*`). `.claude/settings.json` auto-allows the read tools only — every
write and WhatsApp send asks for approval.

Other clients: `command: packages/mcp/node_modules/.bin/tsx`, `args: [packages/mcp/src/main.ts]`,
cwd = repo root. Debug with `pnpm --filter @flowers/mcp inspect` (MCP Inspector).

## Tools

| Area | Read | Write | Sends WhatsApp |
| --- | --- | --- | --- |
| Marketplace | `list_shops`, `list_products_for_moderation`, `list_categories`, `get_pending_supplier_invite` | `review_shop`, `set_shop_seller_types`, `moderate_product`, `approve_products` | `invite_supplier` (delivery=whatsapp) |
| Orders | `list_orders`, `get_order`, `match_suppliers`, `get_cost_rollup` | `create_order`, `update_order_status`, `create_award`, `cancel_award`, `create_document_draft`, `issue_document`, `accept_quotation`, `mark_invoice_paid` | `send_rfqs`, `resend_rfq_nudge`, `send_document_link` |
| WhatsApp | `whatsapp_status`, `list_whatsapp_conversations`, `get_whatsapp_conversation` | `mark_whatsapp_conversation_read` | `send_whatsapp_reply` |

Every WhatsApp message an agent sends is also logged into the admin inbox
(`whatsapp_messages`) so humans see it — best-effort, never blocks the send.

Money is integer LKR cents in and out, as everywhere else in the repo.

## Agents and skills

- Agents (`.claude/agents/`): `order-desk`, `marketplace-moderator`, `whatsapp-concierge`.
- Skills (`.claude/skills/`): `/daily-ops-briefing`, `/whatsapp-order-intake`, `/source-order`,
  `/quote-to-receipt`, `/moderation-review`.

Agents return drafts for anything that messages a person unless told the send is approved.

## Adding a tool

Add a `defineTool({ name, title, description, kind, input, run })` entry to the relevant
`src/tools/*.ts` array. `kind` is `read` | `write` | `send`; it sets the MCP annotations and
read-only filtering. Return an `ActionResult`. If it is a read tool, add
`mcp__flowers__<name>` to `.claude/settings.json` `permissions.allow`.
