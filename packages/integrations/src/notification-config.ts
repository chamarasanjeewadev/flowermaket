import type { SupplierNotificationConfig } from "./supplier-notifications";

export interface NotificationEnv {
  WHATSAPP_SUPPLIER_PROVIDER?: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_INSTANCE?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
}

export function notificationConfigFromEnv(env: NotificationEnv): SupplierNotificationConfig {
  return {
    provider: env.WHATSAPP_SUPPLIER_PROVIDER === "twilio" ? "twilio" : "evolution",
    evolution: { apiUrl: env.EVOLUTION_API_URL ?? "", apiKey: env.EVOLUTION_API_KEY ?? "", instance: env.EVOLUTION_INSTANCE ?? "" },
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    from: env.TWILIO_WHATSAPP_FROM,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
  };
}
