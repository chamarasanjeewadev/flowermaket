/**
 * Display formatting for money. All amounts are integer LKR cents (see the
 * money convention in CLAUDE.md).
 *
 * NOTE: `formatCents` from `@flowers/integrations` produces PayHere's
 * "1234.56" wire strings — do NOT use it for UI. Use `formatRupees` here for
 * anything a buyer reads.
 */

/** Group an integer with thousands separators without relying on Intl/ICU. */
function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format LKR cents for display: `formatRupees(650000)` → "Rs 6,500".
 * Non-zero cents are shown with two decimals: `formatRupees(650050)` → "Rs 6,500.50".
 */
export function formatRupees(cents: number): string {
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const body =
    remainder === 0
      ? `Rs ${group(rupees)}`
      : `Rs ${group(rupees)}.${remainder.toString().padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/**
 * Whole-percent saved when a `compareAtPrice` is present and genuinely higher
 * than the selling price. Returns `null` otherwise so callers never render a
 * misleading "Save 0%" badge.
 */
export function savingsPercent(
  price: number,
  compareAt: number | null | undefined,
): number | null {
  if (compareAt == null || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
