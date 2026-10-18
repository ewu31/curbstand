import { demoUsers } from "./demo-accounts";
import { lowestBid, pacificInputToIso, pacificInputValue } from "./format";
import type { Bid, GroupBuyDetail, GroupBuyEvent, GroupBuySummary, Participant, PickupLocation, Produce } from "./types";

const maya = demoUsers[0];
const jordan = demoUsers[1];
const elena = demoUsers[2];

export const fixtureProduce: Produce[] = [
  { slug: "apples", displayName: "Apples" },
  { slug: "carrots", displayName: "Carrots" },
  { slug: "tomatoes", displayName: "Tomatoes" },
  { slug: "leafy-greens", displayName: "Leafy greens" },
];

export const fixtureLocations: PickupLocation[] = [
  {
    id: "5c1d9e20-2b3c-4d5e-8f01-bbbbbbbbbb01",
    name: "Ballard public pickup",
    address: "Ballard, Seattle",
    region: "Seattle / Puget Sound",
    timezone: "America/Los_Angeles",
    active: true,
  },
  {
    id: "5c1d9e20-2b3c-4d5e-8f01-bbbbbbbbbb02",
    name: "UW District public pickup",
    address: "University District, Seattle",
    region: "Seattle / Puget Sound",
    timezone: "America/Los_Angeles",
    active: true,
  },
  {
    id: "5c1d9e20-2b3c-4d5e-8f01-bbbbbbbbbb03",
    name: "Bellevue public pickup",
    address: "Downtown Bellevue",
    region: "Seattle / Puget Sound",
    timezone: "America/Los_Angeles",
    active: true,
  },
];

const ballard = fixtureLocations[0];
const uw = fixtureLocations[1];
const bellevue = fixtureLocations[2];

function at(days: number, hour: number) {
  const iso = pacificInputToIso(pacificInputValue(days, hour));
  if (!iso) throw new Error("Could not build a fixture timestamp");
  return iso;
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

function bid(partial: Omit<Bid, "notes" | "status" | "createdAt"> & { notes?: string | null; status?: Bid["status"]; createdAt: string }): Bid {
  return {
    notes: partial.notes ?? null,
    status: partial.status ?? "submitted",
    ...partial,
  };
}

function event(id: string, eventType: string, createdAt: string, payload: Record<string, unknown> = {}): GroupBuyEvent {
  return { id, eventType, createdAt, payload };
}

function detail(input: Omit<GroupBuyDetail, "committedLbs" | "remainingLbs"> & { committedLbs?: number }): GroupBuyDetail {
  const committedLbs = input.participants.reduce((sum, person) => sum + person.requestedLbs, 0);
  return {
    ...input,
    committedLbs,
    remainingLbs: Math.max(input.targetLbs - committedLbs, 0),
  };
}

const applesId = "4b6e2a10-1c2d-4e3f-8a01-aaaaaaaaaa01";
const tomatoesId = "4b6e2a10-1c2d-4e3f-8a01-aaaaaaaaaa02";
const carrotsId = "4b6e2a10-1c2d-4e3f-8a01-aaaaaaaaaa03";
const greensId = "4b6e2a10-1c2d-4e3f-8a01-aaaaaaaaaa04";

const createdAt = at(0, 8);

export function createFixtureDetails(): GroupBuyDetail[] {
  const applesPickupStart = at(4, 9);
  const applesPickupEnd = at(4, 11);
  const tomatoesPickupStart = at(7, 9);
  const tomatoesPickupEnd = at(7, 11);
  const carrotsPickupStart = at(10, 9);
  const carrotsPickupEnd = at(10, 11);
  const greensPickupStart = at(13, 9);
  const greensPickupEnd = at(13, 11);
  const greensBidId = "6d4a1f30-3c4d-4e5f-8a02-cccccccccc01";

  return [
    detail({
      id: applesId,
      produceType: "apples",
      targetLbs: 40,
      status: "open",
      pickupLocation: uw,
      pickupWindowStart: applesPickupStart,
      pickupWindowEnd: applesPickupEnd,
      joinDeadline: at(2, 17),
      bidDeadline: at(3, 17),
      selectedBidId: null,
      createdBy: jordan.id,
      createdAt,
      updatedAt: createdAt,
      participants: [],
      bids: [],
      events: [event("evt-apples", "group_buy_created", createdAt, { status: "open" })],
    }),
    detail({
      id: tomatoesId,
      produceType: "tomatoes",
      targetLbs: 50,
      status: "funding",
      pickupLocation: ballard,
      pickupWindowStart: tomatoesPickupStart,
      pickupWindowEnd: tomatoesPickupEnd,
      joinDeadline: at(5, 17),
      bidDeadline: at(6, 17),
      selectedBidId: null,
      createdBy: maya.id,
      createdAt,
      updatedAt: createdAt,
      participants: [
        participant("part-tomatoes-maya", tomatoesId, maya.id, 20, createdAt),
        participant("part-tomatoes-jordan", tomatoesId, jordan.id, 12, createdAt),
      ],
      bids: [
        bid({
          id: "bid-tomatoes",
          groupBuyId: tomatoesId,
          producerId: elena.id,
          pricePerLb: 1.4,
          availableLbs: 80,
          availabilityWindowStart: tomatoesPickupStart,
          availabilityWindowEnd: tomatoesPickupEnd,
          notes: "Ripe this week.",
          createdAt,
        }),
      ],
      events: [
        event("evt-tomatoes-bid", "bid_submitted", createdAt, { bidId: "bid-tomatoes" }),
        event("evt-tomatoes", "group_buy_created", createdAt, { status: "open" }),
      ],
    }),
    detail({
      id: carrotsId,
      produceType: "carrots",
      targetLbs: 30,
      status: "funding",
      pickupLocation: bellevue,
      pickupWindowStart: carrotsPickupStart,
      pickupWindowEnd: carrotsPickupEnd,
      joinDeadline: at(8, 17),
      bidDeadline: at(9, 17),
      selectedBidId: null,
      createdBy: maya.id,
      createdAt,
      updatedAt: createdAt,
      participants: [
        participant("part-carrots-maya", carrotsId, maya.id, 10, createdAt),
        participant("part-carrots-jordan", carrotsId, jordan.id, 20, createdAt),
      ],
      bids: [
        bid({
          id: "bid-carrots",
          groupBuyId: carrotsId,
          producerId: elena.id,
          pricePerLb: 0.9,
          availableLbs: 60,
          availabilityWindowStart: carrotsPickupStart,
          availabilityWindowEnd: carrotsPickupEnd,
          createdAt,
        }),
      ],
      events: [event("evt-carrots", "group_buy_created", createdAt, { status: "open" })],
    }),
    detail({
      id: greensId,
      produceType: "leafy-greens",
      targetLbs: 25,
      status: "matched",
      pickupLocation: ballard,
      pickupWindowStart: greensPickupStart,
      pickupWindowEnd: greensPickupEnd,
      joinDeadline: at(11, 17),
      bidDeadline: at(12, 17),
      selectedBidId: greensBidId,
      createdBy: jordan.id,
      createdAt,
      updatedAt: createdAt,
      participants: [participant("part-greens-jordan", greensId, jordan.id, 25, createdAt)],
      bids: [
        bid({
          id: greensBidId,
          groupBuyId: greensId,
          producerId: elena.id,
          pricePerLb: 2.1,
          availableLbs: 40,
          availabilityWindowStart: greensPickupStart,
          availabilityWindowEnd: greensPickupEnd,
          status: "selected",
          createdAt,
        }),
      ],
      events: [event("evt-greens-selected", "bid_selected", createdAt, { bidId: greensBidId, status: "matched" })],
    }),
  ];
}

export function toSummary(detailRow: GroupBuyDetail): GroupBuySummary {
  return {
    id: detailRow.id,
    produceType: detailRow.produceType,
    targetLbs: detailRow.targetLbs,
    committedLbs: detailRow.committedLbs,
    remainingLbs: detailRow.remainingLbs,
    status: detailRow.status,
    pickupLocation: detailRow.pickupLocation,
    pickupWindowStart: detailRow.pickupWindowStart,
    pickupWindowEnd: detailRow.pickupWindowEnd,
    joinDeadline: detailRow.joinDeadline,
    bidDeadline: detailRow.bidDeadline,
    selectedBidId: detailRow.selectedBidId,
    createdBy: detailRow.createdBy,
    createdAt: detailRow.createdAt,
    updatedAt: detailRow.updatedAt,
    lowestBidPerLb: lowestBid(detailRow.bids),
  };
}
