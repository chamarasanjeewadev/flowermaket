import { afterEach, describe, expect, it, vi } from "vitest";
import {
  toWhatsappJid,
  buildWhatsappLink,
  jidToPhone,
  parseInboundMessage,
  sendWhatsappText,
  getWhatsappStatus,
} from "./evolution";

describe("buildWhatsappLink", () => {
  it("builds a wa.me link from a 94 number", () => {
    expect(buildWhatsappLink("94771234567")).toBe("https://wa.me/94771234567");
  });

  it("normalizes a local 0-prefixed number", () => {
    expect(buildWhatsappLink("0771234567")).toBe("https://wa.me/94771234567");
  });

  it("appends a url-encoded prefilled message", () => {
    expect(buildWhatsappLink("94771234567", "Hi there")).toBe(
      "https://wa.me/94771234567?text=Hi%20there",
    );
  });

  it("returns null for a missing/empty number", () => {
    expect(buildWhatsappLink("")).toBeNull();
    expect(buildWhatsappLink(null)).toBeNull();
    expect(buildWhatsappLink("   ")).toBeNull();
  });
});

describe("toWhatsappJid", () => {
  it("keeps a 94-prefixed number", () => {
    expect(toWhatsappJid("94771234567")).toBe("94771234567@s.whatsapp.net");
  });

  it("converts local 0-prefixed", () => {
    expect(toWhatsappJid("0771234567")).toBe("94771234567@s.whatsapp.net");
  });

  it("strips spaces and +", () => {
    expect(toWhatsappJid("+94 77 123 4567")).toBe("94771234567@s.whatsapp.net");
  });
});

describe("jidToPhone", () => {
  it("strips the whatsapp suffix to digits", () => {
    expect(jidToPhone("94771234567@s.whatsapp.net")).toBe("94771234567");
  });
  it("keeps only digits for odd formats", () => {
    expect(jidToPhone("+94 77 123 4567@s.whatsapp.net")).toBe("94771234567");
  });
});

describe("parseInboundMessage", () => {
  const base = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    event: "messages.upsert",
    data: {
      key: { remoteJid: "94771234567@s.whatsapp.net", fromMe: false, id: "ABC123" },
      pushName: "Kamal",
      messageTimestamp: 1730000000,
      message,
      ...extra,
    },
  });

  it("parses a plain text message", () => {
    const r = parseInboundMessage(base({ conversation: "Hello" }));
    expect(r).not.toBeNull();
    expect(r!.phone).toBe("94771234567");
    expect(r!.keyId).toBe("ABC123");
    expect(r!.pushName).toBe("Kamal");
    expect(r!.kind).toBe("text");
    expect(r!.text).toBe("Hello");
    expect(r!.timestamp).toBe(1730000000);
  });

  it("parses an extendedTextMessage", () => {
    const r = parseInboundMessage(base({ extendedTextMessage: { text: "Hi again" } }));
    expect(r!.kind).toBe("text");
    expect(r!.text).toBe("Hi again");
  });

  it("parses an image with caption and base64", () => {
    const r = parseInboundMessage(
      base({ imageMessage: { caption: "fresh roses", mimetype: "image/jpeg" } }, { message: { imageMessage: { caption: "fresh roses", mimetype: "image/jpeg" } }, base64: "QUJD" }),
    );
    expect(r!.kind).toBe("image");
    expect(r!.text).toBe("fresh roses");
    expect(r!.mediaMime).toBe("image/jpeg");
    expect(r!.mediaBase64).toBe("QUJD");
  });

  it("returns null for fromMe echoes", () => {
    const e = base({ conversation: "my own reply" });
    (e.data.key as { fromMe: boolean }).fromMe = true;
    expect(parseInboundMessage(e)).toBeNull();
  });

  it("returns null for non-message events", () => {
    expect(parseInboundMessage({ event: "connection.update", data: {} })).toBeNull();
    expect(parseInboundMessage(null)).toBeNull();
    expect(parseInboundMessage({})).toBeNull();
  });

  it("falls back to kind=other for unknown message types", () => {
    const r = parseInboundMessage(base({ stickerMessage: { mimetype: "image/webp" } }));
    expect(r!.kind).toBe("other");
    expect(r!.text).toBeNull();
  });
});

describe("parseInboundMessage (Evolution GO)", () => {
  const goEvent = (info: Record<string, unknown>, message: Record<string, unknown>) => ({
    event: "Message",
    instanceId: "i-1",
    data: {
      Info: {
        Chat: "94771234567@s.whatsapp.net",
        Sender: "94771234567@s.whatsapp.net",
        IsFromMe: false,
        IsGroup: false,
        ID: "MSG1",
        PushName: "Nilu",
        Timestamp: "2026-10-06T10:00:00Z",
        ...info,
      },
      Message: message,
    },
  });

  it("parses a text message", () => {
    const p = parseInboundMessage(goEvent({}, { conversation: "hello" }));
    expect(p).toMatchObject({
      phone: "94771234567",
      keyId: "MSG1",
      pushName: "Nilu",
      kind: "text",
      text: "hello",
      timestamp: Date.parse("2026-10-06T10:00:00Z") / 1000,
    });
  });

  it("parses an image with base64", () => {
    const p = parseInboundMessage(
      goEvent({}, { imageMessage: { caption: "roses", mimetype: "image/jpeg" }, base64: "AAAA" }),
    );
    expect(p).toMatchObject({ kind: "image", text: "roses", mediaBase64: "AAAA" });
  });

  it("ignores own messages and groups", () => {
    expect(parseInboundMessage(goEvent({ IsFromMe: true }, { conversation: "x" }))).toBeNull();
    expect(
      parseInboundMessage(goEvent({ IsGroup: true, Chat: "123@g.us" }, { conversation: "x" })),
    ).toBeNull();
  });
});

describe("Evolution GO HTTP", () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = { apiUrl: "https://evo.test/", apiKey: "tok", instance: "sda" };

  it("sends text to /send/text with the instance token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendWhatsappText(config, "0771234567", "hi");
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://evo.test/send/text");
    expect((init.headers as Record<string, string>).apikey).toBe("tok");
    expect(JSON.parse(init.body as string)).toEqual({ number: "94771234567", text: "hi" });
  });

  it("surfaces the server's error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad number", { status: 400 })));
    const res = await sendWhatsappText(config, "0771234567", "hi");
    expect(res).toEqual({ ok: false, message: "WhatsApp send failed (400): bad number" });
  });

  it("reports open when connected and logged in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ data: { Connected: true, LoggedIn: true, Name: "x" }, message: "success" }),
      ),
    );
    expect(await getWhatsappStatus(config)).toEqual({ state: "open", instance: "sda" });
  });

  it("reports missing settings without calling the network", async () => {
    expect(await getWhatsappStatus({ apiUrl: "", apiKey: "", instance: "" })).toEqual({
      state: "not_configured",
      missing: ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"],
    });
  });
});
