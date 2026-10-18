import { pacificInputToIso, pacificInputValue } from "./format";
import { growers, type Person } from "./people";
import type { GroupBuyDetail, GroupBuyEvent, Participant, PickupLocation, Produce, SellerProfile } from "./types";

export const fixtureProduce: Produce[] = [
  { slug: "apples", displayName: "Apples" },
  { slug: "tomatoes", displayName: "Tomatoes" },
  { slug: "carrots", displayName: "Carrots" },
  { slug: "leafy-greens", displayName: "Leafy greens" },
  { slug: "potatoes", displayName: "Potatoes" },
  { slug: "onions", displayName: "Onions" },
  { slug: "strawberries", displayName: "Strawberries" },
  { slug: "kale", displayName: "Kale" },
  { slug: "pears", displayName: "Pears" },
  { slug: "cherries", displayName: "Cherries" },
  { slug: "lettuce", displayName: "Lettuce" },
  { slug: "blueberries", displayName: "Blueberries" },
  { slug: "corn", displayName: "Corn" },
  { slug: "peppers", displayName: "Peppers" },
  { slug: "cucumbers", displayName: "Cucumbers" },
  { slug: "zucchini", displayName: "Zucchini" },
  { slug: "peaches", displayName: "Peaches" },
  { slug: "broccoli", displayName: "Broccoli" },
  { slug: "cabbage", displayName: "Cabbage" },
  { slug: "plums", displayName: "Plums" },
];

export const fixtureLocations: PickupLocation[] = [
  { id: "5c1d9e20-2b3c-4d5e-8f01-bbbbbbbbbb01", name: "Ballard public pickup", address: "Ballard, Seattle", region: "Seattle / Puget Sound", timezone: "America/Los_Angeles", active: true },
  { id: "5c1d9e20-2b3c-4d5e-8f01-bbbbbbbbbb02", name: "UW District public pickup", address: "University District, Seattle", region: "Seattle / Puget Sound", timezone: "America/Los_Angeles", active: true },
  { id: "5c1d9e20-2b3c-4d5e-8f01-bbbbbbbbbb03", name: "Bellevue public pickup", address: "Downtown Bellevue", region: "Seattle / Puget Sound", timezone: "America/Los_Angeles", active: true },
];

const prices: Record<string, number> = {
  apples: 1.25,
  tomatoes: 1.4,
  carrots: 0.95,
  "leafy-greens": 2.15,
  potatoes: 0.75,
  onions: 0.85,
  strawberries: 3.5,
  kale: 2.4,
  pears: 1.6,
  cherries: 4.25,
  lettuce: 1.9,
  blueberries: 3.75,
  corn: 0.7,
  peppers: 2.2,
  cucumbers: 1.1,
  zucchini: 1.15,
  peaches: 2.05,
  broccoli: 1.85,
  cabbage: 0.8,
  plums: 2.35,
};

function at(days: number, hour: number) {
  const iso = pacificInputToIso(pacificInputValue(days, hour));
  if (!iso) throw new Error("Could not build a fixture timestamp");
  return iso;
}

function sellerFor(grower: Person): SellerProfile {
  return {
    id: grower.id,
    name: grower.farmName ?? grower.name,
    photoUrl: grower.photoUrl,
    producerType: grower.producerType,
    bio: `${grower.farmName ?? grower.name} grows produce for neighborhood pickup.`,
  };
}

function participant(id: string, groupBuyId: string, userId: string, requestedLbs: number, createdAt: string): Participant {
  return {
    id,
    groupBuyId,
    userId,
    requestedLbs,
    depositAmount: 10,
    depositStatus: "pending",
    completionStatus: "pending",
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function event(id: string, eventType: string, createdAt: string): GroupBuyEvent {
  return { id, eventType, createdAt, payload: { status: "open" } };
}

function drop(input: Omit<GroupBuyDetail, "committedLbs" | "remainingLbs"> & { committedLbs?: number }): GroupBuyDetail {
  const fromPeople = input.participants.reduce((sum, person) => sum + person.requestedLbs, 0);
  const committedLbs = input.participants.length > 0 ? fromPeople : input.committedLbs ?? 0;
  return {
    ...input,
    committedLbs,
    remainingLbs: Math.max(input.targetLbs - committedLbs, 0),
  };
}

/** Fifty produce drops. The apple and tomato rows keep the quantities the marketplace tests look for. */
export function createFixtureDetails(): GroupBuyDetail[] {
  const createdAt = at(0, 8);
  const [ballard, uw, bellevue] = fixtureLocations;
  const elena = growers[0];
  const mayaId = "8f0b1c2a-6d3e-4f11-9a77-111111111101";
  const appleId = "4b6e2a10-1c2d-4e3f-8a01-aaaaaaaaaa01";
  const tomatoId = "4b6e2a10-1c2d-4e3f-8a01-aaaaaaaaaa02";
  const varied = fixtureProduce.filter((item) => item.slug !== "apples" && item.slug !== "tomatoes");
  const places = [ballard, uw, bellevue];

  const anchors: GroupBuyDetail[] = [
    drop({
      id: appleId,
      produceType: "apples",
      targetLbs: 40,
      pricePerLb: prices.apples,
      description: "Ortiz Family Farm set a fixed price for Honeycrisp apples. The pickup confirms at 40 lb.",
      status: "open",
      pickupLocation: uw,
      pickupWindowStart: at(4, 9),
      pickupWindowEnd: at(4, 11),
      joinDeadline: at(2, 17),
      bidDeadline: at(3, 17),
      selectedBidId: null,
      createdBy: elena.id,
      seller: sellerFor(elena),
      createdAt,
      updatedAt: createdAt,
      participants: [],
      bids: [],
      events: [event("evt-apples", "group_buy_created", createdAt)],
    }),
    drop({
      id: tomatoId,
      produceType: "tomatoes",
      targetLbs: 50,
      pricePerLb: prices.tomatoes,
      description: "Early girl tomatoes from Blake Backyard. 32 lb are already spoken for.",
      status: "funding",
      pickupLocation: ballard,
      pickupWindowStart: at(7, 9),
      pickupWindowEnd: at(7, 11),
      joinDeadline: at(5, 17),
      bidDeadline: at(6, 17),
      selectedBidId: null,
      createdBy: growers[1].id,
      seller: sellerFor(growers[1]),
      createdAt,
      updatedAt: createdAt,
      participants: [participant("part-tomatoes", tomatoId, mayaId, 32, createdAt)],
      bids: [],
      events: [event("evt-tomatoes", "group_buy_created", createdAt)],
    }),
  ];

  const rest = Array.from({ length: 48 }, (_, index) => {
    const produce = varied[index % varied.length];
    const grower = growers[(index + 2) % growers.length];
    const place = places[index % places.length];
    const day = 3 + (index % 14);
    const target = [24, 36, 48, 60, 80, 30][index % 6];
    const committed = [0, 6, 12, 18, 8, 4][index % 6];
    const id = `4b6e2a10-1c2d-4e3f-8a50-${String(index + 1).padStart(12, "0")}`;
    const when = at(0, 8);
    return drop({
      id,
      produceType: produce.slug,
      targetLbs: target,
      committedLbs: committed,
      pricePerLb: Math.round((prices[produce.slug] + (index % 3) * 0.07) * 100) / 100,
      description: `${grower.farmName} is offering ${produce.displayName.toLowerCase()} at a fixed price per pound.`,
      status: committed > 0 ? "funding" : "open",
      pickupLocation: place,
      pickupWindowStart: at(day, 9),
      pickupWindowEnd: at(day, 12),
      joinDeadline: at(Math.max(day - 2, 1), 17),
      bidDeadline: at(Math.max(day - 1, 2), 17),
      selectedBidId: null,
      createdBy: grower.id,
      seller: sellerFor(grower),
      createdAt: when,
      updatedAt: when,
      participants: [],
      bids: [],
      events: [event(`evt-${index + 1}`, "group_buy_created", when)],
    });
  });

  return [...anchors, ...rest];
}
