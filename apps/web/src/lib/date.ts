/**
 * Small, ICU-free date formatting for content dates. We avoid
 * `Intl.DateTimeFormat` because the Workers (workerd) runtime may lack full
 * locale data for `si-LK`. Input is a plain `YYYY-MM-DD` string.
 */
import type { Locale } from "../i18n";

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTHS_SI = [
  "ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි",
  "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්",
] as const;

/** "18 Feb 2026" (en) / "18 පෙබරවාරි 2026" (si). */
export function formatPostDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = locale === "si" ? MONTHS_SI : MONTHS_EN;
  const month = months[m - 1] ?? String(m);
  return `${d} ${month} ${y}`;
}
