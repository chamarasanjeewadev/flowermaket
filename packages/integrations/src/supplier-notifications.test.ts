import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupplierNotificationDelivery, sendSupplierNotification, type SupplierNotificationConfig } from "./supplier-notifications";
const config: SupplierNotificationConfig = { provider: "twilio", evolution: { apiUrl: "", apiKey: "", instance: "" }, accountSid: `AC${"1".repeat(32)}`, authToken: "test-only", from: "+94771234567", messagingServiceSid: `MG${"2".repeat(32)}` };
afterEach(() => vi.unstubAllGlobals());
describe("approved template supplier alerts", () => {
  it("fails closed when the language template is missing", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await sendSupplierNotification(config, { phone: "+94771234567", text: "Test", variables: {} })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends ContentSid and variables, without a free-form Body", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: `SM${"3".repeat(32)}` }), { status: 201 })); vi.stubGlobal("fetch", fetch);
    expect(await sendSupplierNotification(config, { phone: "+94771234567", text: "Test", templateSid: `HX${"4".repeat(32)}`, variables: { "1": "Shop" } })).toEqual({ ok: true, providerId: `SM${"3".repeat(32)}` });
    const body = fetch.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get("ContentSid")).toBe(`HX${"4".repeat(32)}`); expect(body.has("Body")).toBe(false);
    expect(body.get("ContentVariables")).toBe('{"1":"Shop"}');
  });
  it("surfaces provider rejection instead of switching to free-form messages", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Rejected", { status: 400 })); vi.stubGlobal("fetch", fetch);
    expect((await sendSupplierNotification(config, { phone: "+94771234567", text: "Test", templateSid: `HX${"4".repeat(32)}`, variables: {} })).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([["delivered", "delivered"], ["read", "delivered"], ["undelivered", "failed"], ["queued", "sent"]])("maps provider %s to %s", async (providerStatus, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: providerStatus }))));
    expect(await getSupplierNotificationDelivery(config, `SM${"3".repeat(32)}`)).toEqual({ ok: true, status: expected });
  });
});

it("blocks blind retries when a network failure has an unknown delivery outcome", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network lost")));
  const result = await sendSupplierNotification(config, { phone: "+94771234567", text: "Test", templateSid: `HX${"4".repeat(32)}`, variables: {} });
  expect(result).toMatchObject({ ok: false, uncertain: true });
});
