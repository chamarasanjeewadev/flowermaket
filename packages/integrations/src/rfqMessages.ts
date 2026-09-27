/**
 * RFQ, OTP, and document link message builders for WhatsApp.
 *
 * Pure and dependency-free so they are safe in the client bundle and unit-tested
 * in isolation. Provides builders for supplier order-request nudges, OTP codes,
 * and document links (quotations, invoices, receipts).
 */

export type MessageLocale = "en" | "si";

/**
 * Build an RFQ nudge message to remind a supplier about an incoming request.
 * Bilingual: English primary, Sinhala fallback.
 */
export function buildRfqNudge(input: {
  shopName: string;
  orderNo: string;
  portalUrl: string;
  locale: MessageLocale;
}): string {
  const { shopName, orderNo, portalUrl, locale } = input;

  if (locale === "si") {
    return (
      `ඔබ සඳහා නව ඇණවුම් ඉල්ලීමක් ඇත 📋\n` +
      `\n` +
      `ඉල්ලීම අංකය: ${orderNo}\n` +
      `ගබඩාව: ${shopName}\n` +
      `\n` +
      `සම්පූර්ණ විස්තර ලබා ගැනීමට මෙහි ක්ලික් කරන්න:\n` +
      `${portalUrl}\n` +
      `\n` +
      `FlowerMarket.lk 🌸`
    );
  }

  // English
  return (
    `You have a new order request 📋\n` +
    `\n` +
    `Request #: ${orderNo}\n` +
    `Shop: ${shopName}\n` +
    `\n` +
    `View full details:\n` +
    `${portalUrl}\n` +
    `\n` +
    `FlowerMarket.lk 🌸`
  );
}

/**
 * Build an OTP (one-time password) verification message.
 * Bilingual: English primary, Sinhala fallback.
 */
export function buildOtpMessage(input: {
  code: string;
  locale: MessageLocale;
}): string {
  const { code, locale } = input;

  if (locale === "si") {
    return (
      `ඔබගේ FlowerMarket.lk හි ගිණුම තහවුරු කිරීමේ කේතය:\n` +
      `\n` +
      `${code}\n` +
      `\n` +
      `මෙම කේතය කිසි කෙනෙකුට බෙදා නොගන්න.`
    );
  }

  // English
  return (
    `Your FlowerMarket.lk verification code:\n` +
    `\n` +
    `${code}\n` +
    `\n` +
    `Do not share this code with anyone.`
  );
}

/**
 * Build a message with a link to a quotation, invoice, or receipt.
 * Bilingual: English primary, Sinhala fallback.
 */
export function buildDocumentLinkMessage(input: {
  type: "quotation" | "invoice" | "receipt";
  docNo: string;
  url: string;
  locale: MessageLocale;
}): string {
  const { type, docNo, url, locale } = input;

  const typeLabel = {
    quotation: locale === "si" ? "උපුටන" : "Quotation",
    invoice: locale === "si" ? "ප්‍රේෂණ" : "Invoice",
    receipt: locale === "si" ? "ගිණුම්පතර" : "Receipt",
  };

  if (locale === "si") {
    return (
      `ඔබගේ ${typeLabel[type]} ඉහළ දැමිණි 📄\n` +
      `\n` +
      `ලේඛන අංකය: ${docNo}\n` +
      `\n` +
      `ඉදිරිපත්කරණ බලන්න:\n` +
      `${url}\n` +
      `\n` +
      `FlowerMarket.lk 🌸`
    );
  }

  // English
  return (
    `Your ${typeLabel[type]} has been sent 📄\n` +
    `\n` +
    `Document #: ${docNo}\n` +
    `\n` +
    `View here:\n` +
    `${url}\n` +
    `\n` +
    `FlowerMarket.lk 🌸`
  );
}
