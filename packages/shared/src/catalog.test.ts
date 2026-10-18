import { describe, expect, it } from "vitest";
import { distanceMiles, PICKUP_LOCATIONS, producerEligibility } from "./catalog";

const ballard = PICKUP_LOCATIONS.find((l) => l.id === "ballard-commons")!;
const skagitFarm = { produceTypes: ["potatoes"], serviceRadiusMiles: 80, farmLatitude: 48.4232, farmLongitude: -122.3343 };

describe("producerEligibility", () => {
  it("is eligible within radius for a grown produce type", () => {
    const r = producerEligibility(skagitFarm, { produceTypeId: "potatoes", pickupLocation: ballard });
    expect(r).toMatchObject({ eligible: true, reasons: [] });
    expect(r.distanceMiles).toBeGreaterThan(40);
    expect(r.distanceMiles).toBeLessThan(60);
  });

  it("reports every failing reason", () => {
    const r = producerEligibility({ ...skagitFarm, serviceRadiusMiles: 10 }, { produceTypeId: "apples", pickupLocation: ballard });
    expect(r).toMatchObject({ eligible: false, reasons: ["produce_type", "service_radius"] });
  });
});

describe("distanceMiles", () => {
  it("is ~0 for the same point and symmetric", () => {
    expect(distanceMiles(ballard, ballard)).toBe(0);
    const other = PICKUP_LOCATIONS[1]!;
    expect(distanceMiles(ballard, other)).toBeCloseTo(distanceMiles(other, ballard), 6);
  });
});
