/**
 * Pricing math — pure functions for margin application and document totals.
 *
 * All amounts are integer LKR cents. No floats for money.
 * These functions are client-safe (no DB, no server imports).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentLine {
  qty: number;
  unitPrice: number; // LKR cents
}

export interface DocumentTotalsOpts {
  discount?: number;    // LKR cents (default 0)
  deliveryFee?: number; // LKR cents (default 0)
  taxAmount?: number;   // LKR cents (default 0)
}

export interface DocumentTotalsResult {
  subtotal: number; // Σ qty * unitPrice, LKR cents
  total: number;    // subtotal - discount + deliveryFee + taxAmount, LKR cents
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Apply a margin in basis points to a cost in LKR cents.
 * Formula: Math.round(costCents * (10000 + marginBps) / 10000)
 *
 * Examples:
 *   applyMargin(10000, 2500) === 12500  (25% markup)
 *   applyMargin(333, 2500)   === 416    (416.25 rounds to 416)
 */
export function applyMargin(costCents: number, marginBps: number): number {
  return Math.round((costCents * (10000 + marginBps)) / 10000);
}

/**
 * Compute document subtotal and total from line items.
 *
 * subtotal = Σ (line.qty * line.unitPrice)
 * total    = subtotal - discount + deliveryFee + taxAmount
 *
 * All values are integer LKR cents. opts fields default to 0.
 */
export function documentTotals(
  lines: DocumentLine[],
  opts?: DocumentTotalsOpts,
): DocumentTotalsResult {
  const subtotal = lines.reduce(
    (sum, l) => sum + l.qty * l.unitPrice,
    0,
  );

  const discount = opts?.discount ?? 0;
  const deliveryFee = opts?.deliveryFee ?? 0;
  const taxAmount = opts?.taxAmount ?? 0;

  const total = subtotal - discount + deliveryFee + taxAmount;

  return { subtotal, total };
}
