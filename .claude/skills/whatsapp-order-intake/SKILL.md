---
name: whatsapp-order-intake
description: Turn a WhatsApp customer conversation into a FlowerMarket.lk order — read the chat, extract order details, confirm gaps, create the order and propose suppliers. Use when "a customer ordered on WhatsApp", "make an order from this chat", or after triage finds a new order.
---

# WhatsApp → order

1. Find the thread: `list_whatsapp_conversations` (by name/phone) → `get_whatsapp_conversation`.
2. Extract into this shape and show it to the operator:
   - customer: name, phone (from the conversation), language (en/si — match how they write)
   - items: descriptionEn (+ descriptionSi if they wrote Sinhala), quantity, unit
     (exactly one of stem / bunch / box — describe bouquets/arrangements in descriptionEn),
     variant (colour, size, grade), notes
   - category: pick from `list_categories` when obvious, else leave empty
   - delivery: address, district (a slug such as `colombo` — the tool schema lists them), city; neededByDate as YYYY-MM-DD
   - notesCustomer (occasion, card message) / notesInternal (budget, anything for us)
3. List what is missing or ambiguous. Ask the operator — don't guess quantities, dates or
   addresses. If the customer must be asked, draft a short WhatsApp question in their language
   and get approval before `send_whatsapp_reply`.
4. Once the operator confirms the details: `create_order` (source "whatsapp").
5. `match_suppliers` for the new order and present candidates (name, district). Hand off to
   /source-order to send RFQs.
6. Optionally draft an acknowledgement to the customer ("we've got your order FM-…, we'll send a
   quotation shortly") — send only with approval.

Never quote a price in this step; prices come from supplier quotes via /quote-to-receipt.
