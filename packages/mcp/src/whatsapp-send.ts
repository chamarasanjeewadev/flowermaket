/**
 * Send a WhatsApp text and log it into the admin inbox so humans can see what
 * an agent sent. The phone is canonicalised to the JID digits first — the
 * inbox keys conversations by JID, so logging "0771234567" verbatim would
 * open a second thread beside the customer's real "94771234567" one.
 */
import { recordOutboundMessage, type Db } from "@flowers/api";
import {
  jidToPhone,
  sendWhatsappText,
  toWhatsappJid,
  type EvolutionConfig,
  type SendResult,
} from "@flowers/integrations";

export async function sendAndLog(
  db: Db,
  config: EvolutionConfig,
  phone: string,
  text: string,
): Promise<SendResult> {
  const res = await sendWhatsappText(config, phone, text);
  if (res.ok) {
    // Inbox logging is best-effort; never report a delivered message as failed.
    await recordOutboundMessage(db, { phone: jidToPhone(toWhatsappJid(phone)), text }).catch(
      () => undefined,
    );
  }
  return res;
}
