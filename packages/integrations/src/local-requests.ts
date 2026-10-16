/**
 * WhatsApp message builders for local florist requests.
 *
 * Pure and dependency-free (never import @flowers/api). Shop-facing request
 * texts only ever contain the fields of RequestSummary; buildShopAcceptedText is
 * the single shop text that carries customer details.
 *
 * NOTE: Sinhala (si) copy was written by an AI implementer and needs native review.
 */

type Lang = "en" | "si";

export interface RequestSummary {
  ref: string;
  area: string;
  distanceKm?: number;
  neededOn: string;
  window: string;
  occasion: string | null;
  budgetLabel: string;
  flowerLines: string[];
  addons: string[];
}

export const STOP_KEYWORDS: readonly string[] = ["stop", "unsubscribe", "නවත්වන්න"];

export function isStopMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length > 0 && STOP_KEYWORDS.includes(t);
}

function summaryBlock(s: RequestSummary, lang: Lang): string {
  const en = lang === "en";
  const lines: string[] = [];
  lines.push(
    en
      ? `Area: ${s.area}${s.distanceKm !== undefined ? ` (about ${s.distanceKm} km away)` : ""}`
      : `ප්‍රදේශය: ${s.area}${s.distanceKm !== undefined ? ` (කිලෝමීටර් ${s.distanceKm}ක් පමණ දුරින්)` : ""}`,
  );
  lines.push(en ? `Needed: ${s.neededOn}, ${s.window}` : `අවශ්‍ය වන්නේ: ${s.neededOn}, ${s.window}`);
  if (s.occasion) lines.push(en ? `Occasion: ${s.occasion}` : `අවස්ථාව: ${s.occasion}`);
  lines.push(en ? `Budget: ${s.budgetLabel}` : `අයවැය: ${s.budgetLabel}`);
  if (s.flowerLines.length) {
    lines.push(en ? "Flowers:" : "මල්:");
    for (const f of s.flowerLines) lines.push(`- ${f}`);
  }
  if (s.addons.length) {
    lines.push(en ? "Add-ons:" : "අමතර දේ:");
    for (const a of s.addons) lines.push(`- ${a}`);
  }
  return lines.join("\n");
}

export function buildRequestOtpText(code: string, lang: Lang): string {
  return lang === "si"
    ? `ඔබගේ FlowerMarket.lk තහවුරු කිරීමේ කේතය:\n\n*${code}*\n\nමෙම කේතය කිසිවෙකුට නොදෙන්න.`
    : `Your FlowerMarket.lk verification code:\n\n*${code}*\n\nDo not share this code with anyone.`;
}

export function buildRequestOpenedText(
  i: { ref: string; floristCount: number; area: string; pageUrl: string },
  lang: Lang,
): string {
  if (lang === "si") {
    const body =
      i.floristCount > 0
        ? `ඔබගේ ඉල්ලීම *${i.ref}* මල් වෙළඳුන් ${i.floristCount} දෙනෙකුට යවා ඇත. ඔවුන්ගේ මිල ගණන් ලැබෙන විට අපි දන්වන්නෙමු.`
        : `ඔබගේ ඉල්ලීම *${i.ref}* ලැබුණා. ${i.area} අවට මල් වෙළඳුන් සොයමින් සිටිමු; කවුරුන් හෝ ලැබුණු විට දන්වන්නෙමු.`;
    return `${body}\n\nඉල්ලීම බලන්න: ${i.pageUrl}\n\nFlowerMarket.lk`;
  }
  const body =
    i.floristCount > 0
      ? `Your request *${i.ref}* has been sent to ${i.floristCount} ${i.floristCount === 1 ? "florist" : "florists"} near ${i.area}. We'll message you as quotes come in.`
      : `We've got your request *${i.ref}*. We're finding florists near ${i.area} and will message you as soon as we have some.`;
  return `${body}\n\nView your request: ${i.pageUrl}\n\nFlowerMarket.lk`;
}

export function buildShopRequestText(
  i: { shopName: string; summary: RequestSummary; leadUrl: string },
  lang: Lang,
): string {
  if (lang === "si") {
    return (
      `ආයුබෝවන් ${i.shopName},\n\n` +
      `FlowerMarket.lk හි ඔබ අවට නව මල් ඉල්ලීමක් (*${i.summary.ref}*):\n\n` +
      `${summaryBlock(i.summary, lang)}\n\n` +
      `විස්තර බලා මිල ගණන් ලබාදීමට: ${i.leadUrl}`
    );
  }
  return (
    `Hi ${i.shopName},\n\n` +
    `New flower request near you on FlowerMarket.lk (*${i.summary.ref}*):\n\n` +
    `${summaryBlock(i.summary, lang)}\n\n` +
    `View details and send your quote: ${i.leadUrl}`
  );
}

export function buildUnclaimedIntroText(
  i: { listingName: string; summary: RequestSummary; leadUrl: string },
  lang: Lang,
): string {
  if (lang === "si") {
    return (
      `ආයුබෝවන් ${i.listingName},\n\n` +
      `මේ FlowerMarket.lk. ඔබේ ප්‍රදේශයේ ගනුදෙනුකරුවෙකු මල් සඳහා මිල ගණන් ඉල්ලා සිටී (*${i.summary.ref}*):\n\n` +
      `${summaryBlock(i.summary, lang)}\n\n` +
      `විස්තර බලා මිල ලබාදීමට: ${i.leadUrl}\n` +
      `මිල ලබාදීම නොමිලේ.\n\n` +
      `තවත් පණිවිඩ නොවෙනවා නම් STOP හෝ නවත්වන්න ලෙස පිළිතුරු දෙන්න; අපි ඔබට නැවත පණිවිඩ නොයවමු.`
    );
  }
  return (
    `Hi ${i.listingName},\n\n` +
    `This is FlowerMarket.lk. A customer near you is asking for flower quotes (*${i.summary.ref}*):\n\n` +
    `${summaryBlock(i.summary, lang)}\n\n` +
    `View details and send a quote: ${i.leadUrl}\n` +
    `Quoting is free.\n\n` +
    `Reply STOP and we won't message you again.`
  );
}

export function buildQuoteDigestText(
  i: { ref: string; quoteCount: number; pageUrl: string; first: boolean },
  lang: Lang,
): string {
  if (lang === "si") {
    const head = i.first
      ? `ඔබගේ ඉල්ලීම *${i.ref}* සඳහා පළමු මිල ගණන ලැබුණා.`
      : `ඔබගේ ඉල්ලීම *${i.ref}* සඳහා දැන් මිල ගණන් ${i.quoteCount}ක් ඇත.`;
    return `${head}\n\nබලා තෝරාගන්න: ${i.pageUrl}\n\nFlowerMarket.lk`;
  }
  const head = i.first
    ? `You've received your first quote for request *${i.ref}*.`
    : `Request *${i.ref}* now has ${i.quoteCount} quotes.`;
  return `${head}\n\nCompare and choose: ${i.pageUrl}\n\nFlowerMarket.lk`;
}

export function buildCustomerAcceptedText(
  i: { ref: string; shopName: string; shopPhone: string; totalRupees: string },
  lang: Lang,
): string {
  if (lang === "si") {
    return (
      `*${i.ref}* සඳහා ඔබ *${i.shopName}* තෝරාගත්තා. එකඟ වූ මුළු මුදල: Rs ${i.totalRupees}.\n\n` +
      `ඔබ ${i.shopName} වෙත සෘජුවම ගෙවනවා. ඔවුන් අමතන්න: ${i.shopPhone}\n\n` +
      `FlowerMarket.lk`
    );
  }
  return (
    `You've chosen *${i.shopName}* for *${i.ref}*. Agreed total: Rs ${i.totalRupees}.\n\n` +
    `You'll pay ${i.shopName} directly. Their number: ${i.shopPhone}\n\n` +
    `FlowerMarket.lk`
  );
}

export function buildShopAcceptedText(
  i: {
    ref: string;
    customerName: string;
    customerPhone: string;
    address: string;
    neededOn: string;
    window: string;
    totalRupees: string;
    leadUrl: string;
  },
  lang: Lang,
): string {
  if (lang === "si") {
    return (
      `ඔබගේ මිල ගණන තෝරාගත්තා! *${i.ref}*\n\n` +
      `ගනුදෙනුකරු: ${i.customerName}\n` +
      `දුරකථනය: ${i.customerPhone}\n` +
      `ලිපිනය: ${i.address}\n` +
      `අවශ්‍ය වන්නේ: ${i.neededOn}, ${i.window}\n` +
      `එකඟ වූ මුළු මුදල: Rs ${i.totalRupees}\n\n` +
      `ගෙවීම ගනුදෙනුකරුගෙන් සෘජුවම ලබාගන්න.\n` +
      `විස්තර: ${i.leadUrl}`
    );
  }
  return (
    `Your quote was chosen! *${i.ref}*\n\n` +
    `Customer: ${i.customerName}\n` +
    `Phone: ${i.customerPhone}\n` +
    `Address: ${i.address}\n` +
    `Needed: ${i.neededOn}, ${i.window}\n` +
    `Agreed total: Rs ${i.totalRupees}\n\n` +
    `Payment is collected from the customer directly.\n` +
    `Details: ${i.leadUrl}`
  );
}

export function buildShopNotSelectedText(i: { ref: string }, lang: Lang): string {
  return lang === "si"
    ? `*${i.ref}* සඳහා ගනුදෙනුකරු වෙනත් මිල ගණනක් තෝරාගත්තා. ඔබගේ මිල ගණන සඳහා ස්තූතියි.\n\nFlowerMarket.lk`
    : `The customer chose a different quote for *${i.ref}*. Thank you for quoting.\n\nFlowerMarket.lk`;
}
