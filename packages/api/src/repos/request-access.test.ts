import { describe, expect, it } from "vitest";
import { requestCookieName } from "./request-access";
import { signDocCookie, verifyDocCookie } from "./documentAccess";

const SECRET = "test-secret";

describe("requestCookieName", () => {
  it("prefixes the request id", () => {
    expect(requestCookieName("abc")).toBe("lr_access_abc");
  });
});

describe("request access cookie scoping", () => {
  it("validates for its own request", async () => {
    const c = await signDocCookie("lr:abc", SECRET);
    expect(await verifyDocCookie(c, "lr:abc", SECRET)).toBe(true);
  });
  it("fails for a different request", async () => {
    const c = await signDocCookie("lr:abc", SECRET);
    expect(await verifyDocCookie(c, "lr:abd", SECRET)).toBe(false);
  });
  it("fails for a bare document token", async () => {
    const c = await signDocCookie("lr:abc", SECRET);
    expect(await verifyDocCookie(c, "abc", SECRET)).toBe(false);
  });
});
