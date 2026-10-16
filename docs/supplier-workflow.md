# Supplier managed marketplace workflow

Implementation: 2026-10-14. Changes are local; no production migration,
deployment, WhatsApp transmission, or live business record changes were performed.

## Implemented behaviour

- Navigation: Overview, Enquiries & Quotes, Orders, Products, My Store; bouquet
  designer is under Tools. Mobile menu, current-page indication, skip link,
  loading/error feedback, larger controls, reduced motion support.
- Same-site login return paths survive email/phone/Google login and new-shop
  setup. OAuth callback is allowed through the no-shop guard before onboarding.
- New shops start as saved drafts. Setup readiness is derived from the real
  shop, service settings, products and approval. Store live is distinct from
  business approval. Shop approval requests require description, service areas,
  a delivery/collection option and the first product. Optional branding does not
  prevent submission. Existing verified shops are preserved.
- My Store saves service areas, preparation time, delivery/collection options,
  dedicated WhatsApp number, timestamped opt-in and notification language.
  Number ownership is verified manually by FlowerMarket in the admin supplier
  panel. Changing a number invalidates verification. Revoking consent disables
  alert dispatch. Verification does not imply provider connectivity.
- Enquiries are supplier-scoped and contain required date, area, customer notes,
  response deadline and quote actions. Admin can specify a deadline in Sri Lankan
  time; no default deadline or service policy is invented.
- Mobile quote cards include quantity, supply unit price in integer LKR cents,
  preparation time, substitution notes, optional delivery cost and expiry.
  Earlier quotes remain in revision history, including pre-upgrade quotes.
  Identical repeat submissions are no-ops. Expired/closed requests, invalid
  money/quantities, duplicate lines and foreign items are rejected.
- Suppliers can save a question for FlowerMarket in the enquiry record. Admins
  can see questions, quote revisions and alert failures in the order sourcing
  panel. Customer offers continue through the existing admin document system;
  supplier supply prices remain separate from customer pricing.
- Accepting a valid, issued customer quotation belonging to this order updates
  the document and confirms the order atomically. Expired quotations and
  cancelled orders cannot authorize preparation.
- Orders shows only customer-confirmed work. Each supplier updates only their
  assigned quantities through confirmed → preparing → ready → handed over →
  completed. Updates cannot skip stages or continue after cancellation; history
  is retained. Provisional sourcing awards never appear as confirmed work.
- Admins see supplier fulfilment and order history, can start/complete fulfilment
  using existing order transitions, and cancel work. Allocations are locked
  after customer confirmation. Withdrawing confirmed assigned work queues a
  separate supplier change alert, and the cancelled assignment remains visible.
- Confirmed-order, withdrawal, cancellation and completion alerts are stored in
  a durable outbox. Admin reviews the exact text before sending. Enquiry alerts
  keep their existing admin dispatch path; successful sends are protected from
  repeat dispatch, known failures can be retried, and the permanent portal
  enquiry survives notification failure.
- Product editing separates category, species and occasion tags. Availability
  is explicitly In stock / Made to order / Unavailable. Draft, review and live
  status reasons replace misleading Active badges. Forms are grouped by details,
  pricing/availability, photos and publishing, with preview and draft/review
  actions. Public shop enquiries retain the validated shop identity in the
  marketplace WhatsApp handoff, including empty-product shops.

## WhatsApp providers and remaining setup

The existing Evolution GO integration remains the default. `sent` means provider
acceptance, not confirmed delivery. Evolution currently returns no message ID in
this client, so delivery receipts are not claimed.

An optional approved-template adapter is implemented for Twilio. Set the following
secrets/config on **admin**, never in a client bundle:

- `WHATSAPP_SUPPLIER_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- `TWILIO_MESSAGING_SERVICE_SID`
- `SUPPLIER_RFQ_TEMPLATE_EN`, `SUPPLIER_RFQ_TEMPLATE_SI` (approved HX ContentSids)
- `SUPPLIER_ORDER_TEMPLATE_EN`, `SUPPLIER_ORDER_TEMPLATE_SI`
- Existing `SUPPLIER_PORTAL_URL` must be the real supplier origin.

Enquiry templates use variables 1=shop name, 2=request number, 3=exact portal
request URL. Order templates use 1=the localized event message, 2=Orders URL.
Create/review matching template text in the provider console; code does not
submit templates or assume approval. Missing locale templates fail closed and
never fall back to free-form messages. Twilio message IDs are persisted; admins
can explicitly check both enquiry-alert and order-alert delivery status.

Provider reference: [Twilio WhatsApp overview](https://www.twilio.com/docs/whatsapp/api)
and [approved template sending](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).

Ambiguous network/5xx send results are marked `uncertain` and blocked from retries.
A process interruption after the provider accepted a message but before the DB
record completes can leave `sending`. Check provider logs before manually
recovering such a record; blindly retrying can produce duplicate messages.
Provider delivery callbacks and automatic retry scheduling are not implemented.

## Migration and release

`packages/db/migrations/0023_supplier_workflow.sql` adds settings, revision/history
fields and the server-only supplier-alert outbox. It is journaled as a deliberate
custom migration. The prior generated snapshot is stale relative to manually
applied migrations 0018–0022; confirm that baseline in staging before applying
0023. Do not use schema generation to drop/rename unrelated production objects.

All relevant portal/catalog data access is through authenticated server functions
and typed direct-DB repositories. The migration revokes direct authenticated
writes to shop/product/RFQ/award tables to prevent bypassing server guards, and
revokes direct shop reads so notification phone/consent are not exposed by the
old public-shop SELECT policy. Public server DTOs continue serving public shop
fields. Supabase auth and Storage APIs remain in use.

Apply the migration and deploy all affected applications together after reviewing
this change. The new columns must exist before the new server code runs.

## Verification and limits

Local checks: full builds, TypeScript checks, unit/transaction-fixture tests and
browser checks. All 363 tests passed; builds, type checks and diff checks passed.
Responsive product-form checks at 375px, 768px and 1440px found no horizontal overflow.
Transaction fixtures verify business decisions but do not prove
Postgres locks, constraints, RLS or external-provider delivery.

Browser testing at 375px confirmed mobile navigation and explicit availability;
desktop click navigation tested Overview → Enquiries → Products → Add product →
Orders, browser back and direct routes. The reported persistent stale-page bug
was not reproduced; no specific production root cause is claimed. Loading/error
states and preload freshness were improved. Tests used auth-disabled development,
not real OAuth accounts or populated supplier records.

Before release, use an isolated staging Supabase project and provider sandbox to
exercise: create shop → resume setup → product review → business approval → public
shop enquiry WhatsApp handoff → admin intake/assignment → approved-template alert
→ actual login return to the exact enquiry → question/quote/revision → admin
customer offer → customer acceptance recorded by admin → supplier fulfilment →
completion. Repeat with two supplier accounts, an expired request, withdrawn
consent, failed alerts, cancelled assignments and a customer cancellation.

Public buyer enquiries retain the existing WhatsApp handoff and manual admin
intake; this change does not add automatic web enquiry ingestion or supplier
assignment. Customer acceptance remains admin-recorded. Delivery responsibility,
who collects payment, commission and supplier settlement still require business
decisions. No payout amounts or policies were introduced.

## Maintainability refactor

Fulfilment transitions and store review readiness now share pure rules in
`packages/api/src/supplier-workflow.ts`. The supplier UI imports the browser-safe
subpath, and server authorization uses the same transitions. Unknown stages have
no available action; whitespace-only service areas fail the readiness checklist.
Admin order actions share an in-flight guard, error handling and route refresh,
including after failed notification sends. Status histories share one renderer.
The refactor was checked with the full build, type checks and test suite; it does
not add live database or WhatsApp verification.
