---
name: source-order
description: Source a FlowerMarket.lk order from growers — send RFQs, chase non-responders, compare supplier quotes and award lines. Use for "send RFQs for FM-…", "chase suppliers", or "award the quotes".
---

# Source an order

## Send RFQs
1. `get_order` — confirm items, quantities, needed-by date.
2. `match_suppliers` — propose a shortlist (prefer suppliers in or near the delivery district;
   mention district for each). Operator picks.
3. With approval: `send_rfqs` (notify=true sends each supplier a WhatsApp link to quote).
   Report per-supplier dispatch: sent / failed (+ reason, e.g. no phone on record).

## Chase
For RFQs still `sent`/`viewed` with no quote after a reasonable wait, offer
`resend_rfq_nudge` (needs approval — it messages the supplier).

## Compare and award
1. `get_order` — build a table per item: supplier, available qty, unit price (Rs), lead time,
   notes. Highlight the cheapest option that meets the needed-by date.
2. Propose awards: cover each item's full quantity, splitting across suppliers when needed.
   Show total supplier cost.
3. With approval: `create_award` per line (unitCost in LKR cents from the quote line, link
   rfqQuoteLineId). `cancel_award` to undo a mistake.
4. `get_cost_rollup` — confirm every item is fully awarded. Then hand off to /quote-to-receipt.
