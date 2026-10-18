import { describe, expect, it } from "vitest";
import { formatFixed2, lineTotalCents, parseFixed2, positiveLbsSchema } from "./units";
import { canTransitionGroupBuy } from "./enums";

describe("units", () => {
  it("parses and formats 2-decimal strings without floats", () => {
    expect(parseFixed2("12")).toBe(1200);
    expect(parseFixed2("12.5")).toBe(1250);
    expect(parseFixed2("0.07")).toBe(7);
    expect(formatFixed2(1250)).toBe("12.50");
    expect(formatFixed2(7)).toBe("0.07");
    expect(formatFixed2(-7)).toBe("-0.07");
  });

  it("rejects invalid amounts", () => {
    expect(() => parseFixed2("1.234")).toThrow();
    expect(() => parseFixed2("-1")).toThrow();
    expect(() => parseFixed2("abc")).toThrow();
    expect(positiveLbsSchema.safeParse("0").success).toBe(false);
  });

  it("computes line totals with half-up rounding", () => {
    // $2.49/lb * 3.33 lb = $8.2917 -> $8.29
    expect(lineTotalCents(249, 333)).toBe(829);
    // $0.15/lb * 0.10 lb = $0.015 -> $0.02
    expect(lineTotalCents(15, 10)).toBe(2);
  });
});

describe("group-buy transitions", () => {
  it("follows the documented lifecycle", () => {
    expect(canTransitionGroupBuy("open", "funding")).toBe(true);
    expect(canTransitionGroupBuy("open", "matched")).toBe(false);
    expect(canTransitionGroupBuy("ready_for_pickup", "cancelled")).toBe(false);
    expect(canTransitionGroupBuy("matched", "cancelled")).toBe(true);
  });
});
