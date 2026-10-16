import { sendWhatsappText, type EvolutionConfig } from "./evolution";

export interface SupplierNotificationConfig {
  provider: "evolution" | "twilio";
  evolution: EvolutionConfig;
  accountSid?: string;
  authToken?: string;
  from?: string;
  messagingServiceSid?: string;
}
export type SupplierNotificationResult = { ok: true; providerId?: string } | { ok: false; message: string; uncertain?: boolean };
/** Twilio sends approved templates only. Missing templates never fall back to free-form text. */
export async function sendSupplierNotification(config: SupplierNotificationConfig, input: {
  phone: string; text: string; templateSid?: string; variables: Record<string, string>;
}): Promise<SupplierNotificationResult> {
  if (config.provider === "evolution") {
    const result = await sendWhatsappText(config.evolution, input.phone, input.text);
    if (result.ok) return result;
    return { ...result, uncertain: !result.message.includes("not configured") && !/\(4\d\d\)/.test(result.message) };
  }
  if (!config.accountSid || !config.authToken || !config.from || !config.messagingServiceSid || !input.templateSid) return { ok: false, message: "Twilio WhatsApp credentials, sender, messaging service and approved language template must be configured." };
  if (!/^AC[a-f0-9]{32}$/i.test(config.accountSid) || !/^HX[a-f0-9]{32}$/i.test(input.templateSid)) return { ok: false, message: "Invalid Twilio account or approved template ID." };
  const body = new URLSearchParams({ To: `whatsapp:${input.phone}`, From: `whatsapp:${config.from.replace(/^whatsapp:/, "")}`, MessagingServiceSid: config.messagingServiceSid, ContentSid: input.templateSid, ContentVariables: JSON.stringify(input.variables) });
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST", headers: { Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    if (!response.ok) return { ok: false, uncertain: response.status >= 500, message: `Twilio rejected the supplier alert (${response.status}). Check template approval and sender configuration.` };
    const data: unknown = await response.json();
    const providerId = typeof data === "object" && data !== null && "sid" in data && typeof data.sid === "string" ? data.sid : undefined;
    if (!providerId) return { ok: false, uncertain: true, message: "Twilio did not return a message ID. Check provider logs before retrying." };
    return { ok: true, providerId };
  } catch { return { ok: false, uncertain: true, message: "Supplier alert delivery could not be confirmed. Check provider logs before retrying." }; }
}

export async function getSupplierNotificationDelivery(config: SupplierNotificationConfig, providerId: string): Promise<{ ok: true; status: "sent" | "delivered" | "failed" } | { ok: false; message: string }> {
  if (config.provider !== "twilio" || !config.accountSid || !config.authToken || !/^SM[a-f0-9]{32}$/i.test(providerId)) return { ok: false, message: "Delivery checks require a Twilio message ID and configured credentials." };
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages/${providerId}.json`, { headers: { Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}` } });
    if (!response.ok) return { ok: false, message: "Could not read provider delivery status." };
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("status" in data) || typeof data.status !== "string") return { ok: false, message: "Provider returned an unknown delivery status." };
    if (["delivered", "read"].includes(data.status)) return { ok: true, status: "delivered" };
    if (["failed", "undelivered", "canceled"].includes(data.status)) return { ok: true, status: "failed" };
    return { ok: true, status: "sent" };
  } catch { return { ok: false, message: "Could not contact the provider to check delivery." }; }
}
