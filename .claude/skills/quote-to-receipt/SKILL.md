---
name: quote-to-receipt
description: Produce and deliver FlowerMarket.lk customer documents — quotation, invoice and receipt — and move the order through confirmed/invoiced/paid. Use for "quote FM-…", "customer accepted", "send the invoice", or "customer paid".
---

# Quotation → invoice → receipt

All money is LKR cents in tools; show rupees to people. Default margin is 25% (2500 bps);
only change margin, discount or delivery fee when the operator gives the number.

## Quotation
1. `get_cost_rollup` — every item must be fully awarded first (else /source-order).
2. `create_document_draft` type=quotation (+ marginBps / discount / deliveryFee / lineOverrides
   if the operator specified them). Show the operator: lines, unit prices, subtotal, delivery,
   discount, total, and margin over supplier cost.
3. With approval: `issue_document` (order → quoted) then `send_document_link`
   (WhatsApps the customer an OTP-protected link in their language).

## Customer accepts
`accept_quotation` (order → confirmed). Then draft the invoice: `create_document_draft`
type=invoice → review → `issue_document` (order → invoiced) → `send_document_link` with approval.

## Customer pays
Requires the payment method and a reference from the operator (bank ref, receipt no.) —
never assume payment. `mark_invoice_paid` (order → paid). Then `create_document_draft`
type=receipt → `issue_document` → `send_document_link` with approval.

## Then
`update_order_status` → fulfilling when flowers are being prepared, → completed on delivery.
