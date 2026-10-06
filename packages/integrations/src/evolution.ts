/**
 * Evolution GO WhatsApp client (https://github.com/EvolutionAPI/evolution-go).
 *
 * Evolution GO scopes every messaging call to an instance by its **instance
 * token**, sent as the `apikey` header — there is no instance name in the path
 * (unlike Evolution API v2). Endpoints used: `POST /send/text`,
 * `GET /instance/status`.
 *
 * Pure and dependency-free so it is safe in the client bundle.
 * Uses global fetch (Cloudflare Workers-native) for HTTP requests.
 */

export interface EvolutionConfig {
  /** Server origin, e.g. https://evolution.example.com */
  apiUrl: string;
  /** The instance token (Evolution GO manager → instance → "Token da Instância"). */
  apiKey: string;
  /** Instance name — informational (logs/UI); GO identifies the instance by token. */
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
 * Send a WhatsApp text message via Evolution GO (`POST /send/text`).
 *
 * @param config Evolution configuration (apiUrl, instance token)
 * @param to Recipient phone number (normalized internally)
 * @param message Message text to send
 * @returns { ok: true } on success, { ok: false; message: string } on error
 */
export async function sendWhatsappText(
  config: EvolutionConfig,
  to: string,
  message: string,
): Promise<SendResult> {
  if (!config.apiUrl || !config.apiKey) {
    return {
      ok: false,
      message: "WhatsApp (Evolution API) is not configured",
    };
  }

  try {
    const res = await fetch(`${config.apiUrl.replace(/\/$/, "")}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number: toWhatsappJid(to).replace("@s.whatsapp.net", ""),
        text: message,
      }),
    });

    if (!res.ok) {
      const detail = await readErrorDetail(res);
      return {
        ok: false,
        message: `WhatsApp send failed (${res.status})${detail ? `: ${detail}` : ""}`,
      };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: `WhatsApp send failed: ${e instanceof Error ? e.message : "network error"}`,
    };
  }
}

/**
 * Health of the Evolution instance, as surfaced to the admin before sending.
 * - `not_configured` — one of the EVOLUTION_* settings is missing.
 * - `open`           — the WhatsApp session is connected and can send.
 * - `disconnected`   — reachable, but the phone is logged out / connecting.
 * - `unreachable`    — the API could not be reached or rejected the key.
 */
export type WhatsappStatus =
  | { state: "not_configured"; missing: string[] }
  | { state: "open"; instance: string }
  | { state: "disconnected"; instance: string; detail: string }
  | { state: "unreachable"; detail: string };

/** Query Evolution GO `GET /instance/status` for the token's instance. */
export async function getWhatsappStatus(
  config: Partial<EvolutionConfig>,
  timeoutMs = 4000,
): Promise<WhatsappStatus> {
  const missing = (
    [
      ["EVOLUTION_API_URL", config.apiUrl],
      ["EVOLUTION_API_KEY", config.apiKey],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0 || !config.apiUrl || !config.apiKey) {
    return { state: "not_configured", missing };
  }
  const instance = config.instance || "instance";

  try {
    const res = await fetch(`${config.apiUrl.replace(/\/$/, "")}/instance/status`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      return {
        state: "unreachable",
        detail:
          res.status === 401
            ? "Instance token rejected (check EVOLUTION_API_KEY)"
            : `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      };
    }
    const body = (await res.json()) as {
      data?: { Connected?: boolean; LoggedIn?: boolean; Name?: string };
    };
    const connected = body.data?.Connected === true;
    const loggedIn = body.data?.LoggedIn === true;
    if (connected && loggedIn) return { state: "open", instance };
    return {
      state: "disconnected",
      instance,
      detail: !loggedIn ? "logged out — scan the QR code again" : "not connected",
    };
  } catch (e) {
    return {
      state: "unreachable",
      detail: e instanceof Error ? e.message : "network error",
    };
  }
}

/** Best-effort short error text from an Evolution error response. */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const text = (await res.text()).trim();
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return "";
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

interface GoMessageEvent {
  event?: string;
  data?: {
    Info?: {
      Chat?: string;
      Sender?: string;
      IsFromMe?: boolean;
      IsGroup?: boolean;
      ID?: string;
      PushName?: string;
      Timestamp?: string;
    };
    Message?: Record<string, unknown> | null;
  };
}

/** Classify a WhatsApp message body (same protobuf JSON in v2 and GO). */
function classifyBody(msg: Record<string, unknown>): {
  kind: ParsedInbound["kind"];
  text: string | null;
  mediaMime: string | null;
} {
  if (typeof msg.conversation === "string" && msg.conversation) {
    return { kind: "text", text: msg.conversation, mediaMime: null };
  }
  if (isObj(msg.extendedTextMessage)) {
    return { kind: "text", text: strOrNull(msg.extendedTextMessage.text), mediaMime: null };
  }
  if (isObj(msg.imageMessage)) {
    return {
      kind: "image",
      text: strOrNull(msg.imageMessage.caption),
      mediaMime: strOrNull(msg.imageMessage.mimetype),
    };
  }
  if (isObj(msg.audioMessage)) {
    return { kind: "audio", text: null, mediaMime: strOrNull(msg.audioMessage.mimetype) };
  }
  if (isObj(msg.documentMessage)) {
    return {
      kind: "document",
      text: strOrNull(msg.documentMessage.fileName),
      mediaMime: strOrNull(msg.documentMessage.mimetype),
    };
  }
  return { kind: "other", text: null, mediaMime: null };
}

/**
 * Normalize an Evolution GO `Message` webhook event
 * (`{ event: "Message", data: { Info, Message } }`). Media arrives as
 * `data.Message.base64` when the server has WEBHOOK_FILES enabled.
 */
function parseGoMessage(e: GoMessageEvent): ParsedInbound | null {
  const info = e.data?.Info;
  const msg = e.data?.Message;
  if (!info || !isObj(msg)) return null;
  if (info.IsFromMe || info.IsGroup) return null;
  const remoteJid = info.Chat ?? "";
  // Only 1:1 chats with a phone JID (skip groups, broadcasts, newsletters).
  if (!remoteJid.endsWith("@s.whatsapp.net")) return null;

  const { kind, text, mediaMime } = classifyBody(msg);
  const ts = info.Timestamp ? Date.parse(info.Timestamp) : NaN;
  return {
    remoteJid,
    phone: jidToPhone(remoteJid),
    keyId: info.ID ?? null,
    pushName: strOrNull(info.PushName),
    kind,
    text,
    mediaBase64: kind === "image" ? strOrNull(msg.base64) : null,
    mediaMime,
    timestamp: Number.isFinite(ts) ? Math.floor(ts / 1000) : null,
  };
}

/**
 * Normalize a single inbound webhook event from Evolution GO (`Message`) or
 * Evolution API v2 (`messages.upsert`). Returns null when the event is not an
 * inbound 1:1 message we handle (other events, fromMe echoes, groups, empty
 * bodies). Tolerant of extra/unknown fields.
 */
export function parseInboundMessage(event: unknown): ParsedInbound | null {
  if (!event || typeof event !== "object") return null;
  if ((event as { event?: unknown }).event === "Message") {
    return parseGoMessage(event as GoMessageEvent);
  }

  const e = event as RawUpsert;
  if (e.event !== "messages.upsert") return null;
  const d = e.data;
  if (!d || !d.key || !d.message) return null;
  if (d.key.fromMe) return null;

  const remoteJid = d.key.remoteJid ?? "";
  if (!remoteJid) return null;

  const { kind, text, mediaMime } = classifyBody(d.message);

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
