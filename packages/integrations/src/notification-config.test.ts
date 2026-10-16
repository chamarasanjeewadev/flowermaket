import { describe, expect, it } from "vitest";
import { notificationConfigFromEnv } from "./notification-config";

describe("notificationConfigFromEnv", () => {
  it("selects twilio", () => {
    const c = notificationConfigFromEnv({ WHATSAPP_SUPPLIER_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_WHATSAPP_FROM: "+1", TWILIO_MESSAGING_SERVICE_SID: "MG1" });
    expect(c).toMatchObject({ provider: "twilio", accountSid: "AC1", authToken: "t", from: "+1", messagingServiceSid: "MG1" });
  });
  it("defaults to evolution with empty strings", () => {
    const c = notificationConfigFromEnv({});
    expect(c.provider).toBe("evolution");
    expect(c.evolution).toEqual({ apiUrl: "", apiKey: "", instance: "" });
  });
});
