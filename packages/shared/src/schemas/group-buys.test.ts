import { describe, expect, it } from "vitest";
import { createBidSchema, createGroupBuySchema, listGroupBuysQuerySchema } from "./group-buys";

const validGroupBuy = {
  produceType: "apples",
  targetLbs: "50",
  pickupLocationId: "ballard-commons",
  joinDeadline: "2026-10-20T17:00:00-07:00",
  bidDeadline: "2026-10-21T17:00:00-07:00",
  pickupWindowStart: "2026-10-24T10:00:00-07:00",
  pickupWindowEnd: "2026-10-24T12:00:00-07:00",
};

describe("createGroupBuySchema", () => {
  it("parses to storage units and UTC dates", () => {
    const v = createGroupBuySchema.parse(validGroupBuy);
    expect(v.targetLbs).toBe(5000);
    expect(v.pickupWindowStart.toISOString()).toBe("2026-10-24T17:00:00.000Z");
  });

  it("rejects unknown catalog values and bad schedules", () => {
    const r = createGroupBuySchema.safeParse({
      ...validGroupBuy,
      produceType: "durian",
      pickupLocationId: "my-house",
      joinDeadline: "2026-10-22T17:00:00-07:00",
      pickupWindowEnd: "2026-10-24T09:00:00-07:00",
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["produceType", "pickupLocationId"]));
  });

  it("checks schedule order", () => {
    const r = createGroupBuySchema.safeParse({ ...validGroupBuy, joinDeadline: "2026-10-22T17:00:00-07:00" });
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(["joinDeadline"]);
  });

  it("rejects float numbers for quantity", () => {
    expect(createGroupBuySchema.safeParse({ ...validGroupBuy, targetLbs: 50 }).success).toBe(false);
  });
});

describe("createBidSchema", () => {
  it("parses money to cents", () => {
    const v = createBidSchema.parse({
      pricePerLbUsd: "1.85",
      availableLbs: "120.5",
      availabilityWindowStart: "2026-10-24T09:00:00Z",
      availabilityWindowEnd: "2026-10-24T20:00:00Z",
    });
    expect(v.pricePerLbUsd).toBe(185);
    expect(v.availableLbs).toBe(12050);
  });
});

describe("listGroupBuysQuerySchema", () => {
  it("accepts empty and known filters", () => {
    expect(listGroupBuysQuerySchema.parse({})).toEqual({});
    expect(listGroupBuysQuerySchema.safeParse({ produceType: "nope" }).success).toBe(false);
  });
});
