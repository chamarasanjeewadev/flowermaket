import { describe, expect, it } from "vitest";
import {
  initialModeration,
  nextModerationOnEdit,
  nextModerationOnImageAdd,
} from "./moderation";

describe("initialModeration", () => {
  it("owner-created products await review", () => {
    expect(initialModeration("owner")).toBe("pending");
  });
  it("admin-created products are approved", () => {
    expect(initialModeration("admin")).toBe("approved");
  });
});

describe("nextModerationOnEdit (owner)", () => {
  it("sends an approved product back to review when content changes", () => {
    expect(nextModerationOnEdit("approved", { price: 100 }, "owner")).toBe("pending");
    expect(nextModerationOnEdit("approved", { nameEn: "X" }, "owner")).toBe("pending");
    expect(nextModerationOnEdit("approved", { descriptionSi: null }, "owner")).toBe(
      "pending",
    );
    expect(nextModerationOnEdit("approved", { categoryId: "c" }, "owner")).toBe("pending");
  });

  it("keeps approval for stock / lead time / status changes", () => {
    expect(
      nextModerationOnEdit(
        "approved",
        { stockQty: 3, leadTimeDays: 2, status: "paused", minOrderQty: 10 },
        "owner",
      ),
    ).toBe("approved");
  });

  it("never unblocks a blocked product", () => {
    expect(nextModerationOnEdit("blocked", { price: 100 }, "owner")).toBe("blocked");
  });

  it("keeps pending as pending", () => {
    expect(nextModerationOnEdit("pending", { stockQty: 1 }, "owner")).toBe("pending");
  });
});

describe("nextModerationOnEdit (admin)", () => {
  it("leaves moderation unchanged", () => {
    expect(nextModerationOnEdit("approved", { price: 1 }, "admin")).toBe("approved");
    expect(nextModerationOnEdit("blocked", { price: 1 }, "admin")).toBe("blocked");
    expect(nextModerationOnEdit("pending", { price: 1 }, "admin")).toBe("pending");
  });
});

describe("nextModerationOnImageAdd", () => {
  it("owner adding a photo re-queues an approved product", () => {
    expect(nextModerationOnImageAdd("approved", "owner")).toBe("pending");
    expect(nextModerationOnImageAdd("blocked", "owner")).toBe("blocked");
  });
  it("admin adding a photo keeps the state", () => {
    expect(nextModerationOnImageAdd("approved", "admin")).toBe("approved");
  });
});
