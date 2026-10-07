---
name: daily-ops-briefing
description: Morning operations briefing for FlowerMarket.lk — unread WhatsApp, orders by stage, RFQs waiting on suppliers, quotations/invoices waiting on customers, pending product and shop reviews. Use when asked "what needs doing today", "daily briefing", or "ops status".
---

# Daily ops briefing

Read-only. Uses the `flowers` MCP server; no approvals needed.

1. `whatsapp_status` — note if WhatsApp is disconnected (top of the briefing if so).
2. `list_whatsapp_conversations` unreadOnly=true — count and one line per thread (name/phone, preview).
3. `list_orders` with status [draft, sourcing, quoted, confirmed, invoiced, paid, fulfilling].
   For each, `get_order` and work out what it is waiting on:
   - draft → needs RFQs sent (operator)
   - sourcing → RFQs with status sent/viewed and no quote yet (supplier); quotes received but
     items not fully awarded (operator)
   - quoted → customer to accept the quotation
   - confirmed → invoice to be drafted/issued (operator)
   - invoiced → customer payment
   - paid → receipt + fulfilment (operator)
   Flag anything whose neededByDate is today, tomorrow, or past.
4. `list_products_for_moderation` moderation=pending (limit 1 — just the counts).
5. `list_shops` status=pending.

## Output

```
## FlowerMarket.lk — <date>
⚠ Urgent (needed within 48h / overdue)
- FM-2026-0012 · Nimali · needed tomorrow · waiting on supplier quotes

Waiting on us        (n)  …one line each with the next action
Waiting on customers (n)  …
Waiting on suppliers (n)  …
WhatsApp unread      (n)  …
Moderation           n products pending · n shops pending
```

Amounts in rupees (tools return LKR cents: divide by 100). End with the top 3 suggested
actions and which agent/skill handles each (order-desk, whatsapp-concierge,
marketplace-moderator, /whatsapp-order-intake, /source-order, /quote-to-receipt,
/moderation-review).
