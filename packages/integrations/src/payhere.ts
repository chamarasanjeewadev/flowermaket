/**
 * PayHere checkout + notify helpers (https://support.payhere.lk/api-&-mobile-sdk).
 *
 * Phase 0 ships the typed surface only; the MD5 hashing helpers (via `js-md5`
 * — crypto.subtle lacks MD5 on Workers) land in Phase 2. `formatCents` is
 * implemented now because amount formatting is needed before payments are.
 */

/** Fields form-POSTed to the PayHere checkout endpoint. */
export interface PayHereCheckoutFields {
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  currency: string;
  amount: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  hash: string;
}

/** Params PayHere form-POSTs to our notify_url after a payment attempt. */
export interface PayHereNotifyParams {
  merchant_id: string;
  order_id: string;
  payment_id: string;
  payhere_amount: string;
  payhere_currency: string;
  /** 2 = success, 0 = pending, -1 = cancelled, -2 = failed, -3 = chargedback. */
  status_code: string;
  md5sig: string;
}

/** Checkout hash: MD5(merchantId + orderId + amount + currency + MD5(secret)). */
export function buildCheckoutHash(
  _merchantId: string,
  _merchantSecret: string,
  _orderId: string,
  _amount: string,
  _currency: string,
): string {
  throw new Error("not implemented — Phase 2");
}

/** Build the full signed field set for the checkout form-POST redirect. */
export function buildCheckoutFields(_input: {
  merchantId: string;
  merchantSecret: string;
  orderId: string;
  amountCents: number;
  currency: string;
  items: string;
  customerEmail: string;
  customerName?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}): PayHereCheckoutFields {
  throw new Error("not implemented — Phase 2");
}

/** Verify the md5sig on a PayHere server-to-server notification. */
export function verifyNotifySig(
  _params: PayHereNotifyParams,
  _merchantSecret: string,
): boolean {
  throw new Error("not implemented — Phase 2");
}

/** Integer cents → PayHere decimal string with exactly two places ("1234.56"). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}
