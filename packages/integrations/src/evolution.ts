/**
 * Evolution API WhatsApp client for order notifications.
 *
 * Pure and dependency-free so it is safe in the client bundle.
 * Uses global fetch (Cloudflare Workers-native) for HTTP requests.
 */

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

export type SendResult = { ok: true } | { ok: false; message: string };

/**
 * Normalize a Sri Lankan phone number to WhatsApp JID format.
 *
 * - Strips all non-digits
 * - Converts leading 0 to 94 prefix
 * - Ensures 94 prefix (adds if missing)
 * - Appends @s.whatsapp.net
 *
 * @param phone A phone number (e.g. "0771234567", "94771234567", "+94 77 123 4567")
 * @returns WhatsApp JID (e.g. "94771234567@s.whatsapp.net")
 */
export function toWhatsappJid(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = `94${d.slice(1)}`;
  if (!d.startsWith("94")) d = `94${d}`;
  return `${d}@s.whatsapp.net`;
}

/**
 * Build a click-to-chat wa.me link for a Sri Lankan number, with an optional
 * prefilled message. Returns null when no usable digits are present.
 */
export function buildWhatsappLink(
  phone: string | null | undefined,
  message?: string,
): string | null {
  if (!phone || !phone.replace(/\D/g, "")) return null;
  const digits = toWhatsappJid(phone).replace("@s.whatsapp.net", "");
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/**
 * Send a WhatsApp text message via Evolution API.
 *
 * @param config Evolution API configuration (apiUrl, apiKey, instance)
 * @param to Recipient phone number (normalized internally)
 * @param message Message text to send
 * @returns { ok: true } on success, { ok: false; message: string } on error
 */
export async function sendWhatsappText(
  config: EvolutionConfig,
  to: string,
  message: string,
): Promise<SendResult> {
  if (!config.apiUrl || !config.apiKey || !config.instance) {
    return {
      ok: false,
      message: "WhatsApp (Evolution API) is not configured",
    };
  }

  try {
    const res = await fetch(
      `${config.apiUrl.replace(/\/$/, "")}/message/sendText/${config.instance}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.apiKey,
        },
        body: JSON.stringify({ number: toWhatsappJid(to), text: message }),
      },
    );

    if (!res.ok) {
      return {
        ok: false,
        message: `WhatsApp send failed (${res.status})`,
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "WhatsApp send failed",
    };
  }
}

/** Strip a WhatsApp JID (e.g. "9477...@s.whatsapp.net") to its digits. */
export function jidToPhone(jid: string): string {
  return (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
}

export interface ParsedInbound {
  remoteJid: string;
  phone: string;
  keyId: string | null;
  pushName: string | null;
  kind: "text" | "image" | "audio" | "document" | "other";
  text: string | null;
  mediaBase64: string | null;
  mediaMime: string | null;
  timestamp: number | null;
}

interface RawUpsert {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    messageTimestamp?: number | string;
    message?: Record<string, unknown> | null;
    base64?: string;
  };
}

/**
 * Normalize a single Evolution `messages.upsert` event. Returns null when the
 * event is not an inbound message we handle (wrong event, fromMe echo, no
 * message body). Tolerant of extra/unknown fields.
 */
export function parseInboundMessage(event: unknown): ParsedInbound | null {
  const e = event as RawUpsert | null;
  if (!e || typeof e !== "object") return null;
  if (e.event && e.event !== "messages.upsert") return null;
  const d = e.data;
  if (!d || !d.key || !d.message) return null;
  if (d.key.fromMe) return null;

  const remoteJid = d.key.remoteJid ?? "";
  if (!remoteJid) return null;

  const msg = d.message;
  let kind: ParsedInbound["kind"] = "other";
  let text: string | null = null;
  let mediaMime: string | null = null;

  if (typeof msg.conversation === "string") {
    kind = "text";
    text = msg.conversation;
  } else if (isObj(msg.extendedTextMessage)) {
    kind = "text";
    text = strOrNull(msg.extendedTextMessage.text);
  } else if (isObj(msg.imageMessage)) {
    kind = "image";
    text = strOrNull(msg.imageMessage.caption);
    mediaMime = strOrNull(msg.imageMessage.mimetype);
  } else if (isObj(msg.audioMessage)) {
    kind = "audio";
    mediaMime = strOrNull(msg.audioMessage.mimetype);
  } else if (isObj(msg.documentMessage)) {
    kind = "document";
    text = strOrNull(msg.documentMessage.fileName);
    mediaMime = strOrNull(msg.documentMessage.mimetype);
  }

  const tsRaw = d.messageTimestamp;
  const timestamp =
    typeof tsRaw === "number"
      ? tsRaw
      : typeof tsRaw === "string" && tsRaw.trim()
        ? Number(tsRaw)
        : null;

  return {
    remoteJid,
    phone: jidToPhone(remoteJid),
    keyId: d.key.id ?? null,
    pushName: strOrNull(d.pushName),
    kind,
    text,
    mediaBase64: kind === "image" ? strOrNull(d.base64) : null,
    mediaMime,
    timestamp: timestamp !== null && Number.isFinite(timestamp) ? timestamp : null,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
