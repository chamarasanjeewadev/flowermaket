import { describe, it, expect } from "vitest";
import {
  buildRfqNudge,
  buildOtpMessage,
  buildDocumentLinkMessage,
} from "./rfqMessages";

describe("RFQ and OTP message builders", () => {
  it("rfq nudge includes order no + url", () => {
    const m = buildRfqNudge({
      shopName: "Green Grove",
      orderNo: "FM-2026-0001",
      portalUrl: "https://s.lk/rfqs/1",
      locale: "en",
    });
    expect(m).toContain("FM-2026-0001");
    expect(m).toContain("https://s.lk/rfqs/1");
  });

  it("otp message includes the code", () => {
    expect(
      buildOtpMessage({ code: "482913", locale: "en" }),
    ).toContain("482913");
  });

  it("doc link message includes url + docNo", () => {
    const m = buildDocumentLinkMessage({
      type: "invoice",
      docNo: "FM-INV-2026-0001",
      url: "https://f.lk/en/d/tok",
      locale: "en",
    });
    expect(m).toContain("FM-INV-2026-0001");
    expect(m).toContain("https://f.lk/en/d/tok");
  });
});
