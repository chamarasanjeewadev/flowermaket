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
