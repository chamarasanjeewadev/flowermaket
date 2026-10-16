import { describe, expect, it } from "vitest";
import { canUpdateFulfilment, normalizeNotificationPhone } from "./supplier-portal";
describe("supplier preparation authorization", () => {
  it.each(["draft", "sourcing", "quoted", "cancelled", "completed"])("never permits preparation for %s", status => {
    expect(canUpdateFulfilment(status, "confirmed", "preparing")).toBe(false);
  });
  it.each(["confirmed", "invoiced", "paid", "fulfilling"])("allows confirmed work at %s", status => {
    expect(canUpdateFulfilment(status, "confirmed", "preparing")).toBe(true);
  });
  it("blocks skipped stages, repeated submits, and reversing completion", () => {
    expect(canUpdateFulfilment("confirmed", "confirmed", "completed")).toBe(false);
    expect(canUpdateFulfilment("confirmed", "preparing", "preparing")).toBe(false);
    expect(canUpdateFulfilment("confirmed", "completed", "preparing")).toBe(false);
  });
  it("accepts each handover stage", () => {
    expect(canUpdateFulfilment("fulfilling", "preparing", "ready")).toBe(true);
    expect(canUpdateFulfilment("fulfilling", "ready", "handed_over")).toBe(true);
    expect(canUpdateFulfilment("fulfilling", "handed_over", "completed")).toBe(true);
  });
});
describe("notification phone validation", () => {
  it.each(["0771234567", "+94 77 123 4567", "94771234567"])("normalizes %s", raw => expect(normalizeNotificationPhone(raw)).toBe("+94771234567"));
  it.each(["", "+44771234567", "077123", "0111234567", "0771234567<script>"])("rejects %s", raw => expect(normalizeNotificationPhone(raw)).toBeNull());
});
