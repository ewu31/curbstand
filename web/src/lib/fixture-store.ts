import { demoUsers } from "./demo-accounts";
import { readSession } from "./session";
import { ApiError } from "./api-error";
import { createFixtureDetails, fixtureLocations, fixtureProduce, toSummary } from "./fixtures";
import type { BidInput, Catalog, CreateGroupBuyInput, DepositStatus, GroupBuyDetail, Mine, PickupLocation, Role } from "./types";

const STORAGE_KEY = "curbstand.fixture-db";
const IN_PROGRESS = new Set(["open", "funding", "matched", "ready_for_pickup"]);

type FixtureDb = { groupBuys: GroupBuyDetail[] };

function readDb(): FixtureDb {
  const base = { groupBuys: createFixtureDetails() };
  if (typeof sessionStorage === "undefined") return base;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as FixtureDb;
    if (!Array.isArray(parsed.groupBuys)) return base;
    return parsed;
  } catch {
    return base;
  }
}

function writeDb(db: FixtureDb) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function requireAccount(userId: string | null, role?: Role) {
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "x-user-id is required for this MVP API");
  const session = readSession();
  const account = demoUsers.find((user) => user.id === userId) ?? (session?.id === userId ? session : null);
  if (!account) throw new ApiError(401, "UNAUTHENTICATED", "User was not found");
  if (role && account.role !== role) throw new ApiError(403, "FORBIDDEN", `${role} role is required`);
  return account;
}

function locationById(id: string): PickupLocation | undefined {
  return fixtureLocations.find((location) => location.id === id && location.active);
}

export function getCatalog(): Promise<Catalog> {
  return Promise.resolve({ produce: fixtureProduce, locations: fixtureLocations });
}

export function listGroupBuys(filters: { produceType?: string; locationId?: string }) {
  const rows = readDb()
    .groupBuys
    .filter((groupBuy) => IN_PROGRESS.has(groupBuy.status))
    .filter((groupBuy) => !filters.produceType || groupBuy.produceType === filters.produceType)
    .filter((groupBuy) => !filters.locationId || groupBuy.pickupLocation?.id === filters.locationId)
    .sort((a, b) => a.pickupWindowStart.localeCompare(b.pickupWindowStart))
    .map(toSummary);
  return Promise.resolve(rows);
}

export function getGroupBuy(id: string) {
  const groupBuy = readDb().groupBuys.find((item) => item.id === id);
  if (!groupBuy) return Promise.reject(new ApiError(404, "NOT_FOUND", "Group buy not found"));
  return Promise.resolve(groupBuy);
}

export function createGroupBuy(input: CreateGroupBuyInput, userId: string | null) {
  requireAccount(userId, "customer");
  const start = new Date(input.pickupWindowStart);
  const end = new Date(input.pickupWindowEnd);
  const join = new Date(input.joinDeadline);
  const bid = new Date(input.bidDeadline);
  if (!(start < end && join < bid && bid <= start)) {
    throw new ApiError(400, "INVALID_SCHEDULE", "Deadlines must precede pickup and the pickup window must be ordered");
  }
  const location = locationById(input.pickupLocationId);
  if (!location) throw new ApiError(400, "INVALID_PICKUP_LOCATION", "Pickup location is not approved");
  const now = new Date().toISOString();
  const groupBuy: GroupBuyDetail = {
    id: crypto.randomUUID(),
    produceType: input.produceType,
    targetLbs: input.targetLbs,
    committedLbs: 0,
    remainingLbs: input.targetLbs,
    status: "open",
    pickupLocation: location,
    pickupWindowStart: input.pickupWindowStart,
    pickupWindowEnd: input.pickupWindowEnd,
    joinDeadline: input.joinDeadline,
    bidDeadline: input.bidDeadline,
    selectedBidId: null,
    createdBy: userId!,
    createdAt: now,
    updatedAt: now,
    participants: [],
    bids: [],
    events: [{ id: crypto.randomUUID(), eventType: "group_buy_created", createdAt: now, payload: { status: "open" } }],
  };
  const db = readDb();
  db.groupBuys.push(groupBuy);
  writeDb(db);
  return Promise.resolve(toSummary(groupBuy));
}

export function joinGroupBuy(id: string, requestedLbs: number, userId: string | null) {
  const actor = requireAccount(userId, "customer");
  if (!(requestedLbs > 0)) throw new ApiError(400, "INVALID_REQUEST", "Requested pounds must be greater than 0");
  const db = readDb();
  const groupBuy = db.groupBuys.find((item) => item.id === id);
  if (!groupBuy) throw new ApiError(404, "NOT_FOUND", "Group buy not found");
  if (!["open", "funding"].includes(groupBuy.status) || new Date() > new Date(groupBuy.joinDeadline)) {
    throw new ApiError(409, "JOIN_CLOSED", "This group buy is no longer accepting participants");
  }
  if (groupBuy.participants.some((person) => person.userId === actor.id)) {
    throw new ApiError(409, "ALREADY_JOINED", "Customer already joined this group buy");
  }
  const now = new Date().toISOString();
  const participant = {
    id: crypto.randomUUID(),
    groupBuyId: id,
    userId: userId!,
    requestedLbs,
    depositAmount: 10,
    depositStatus: "pending" as const,
    completionStatus: "pending" as const,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  groupBuy.participants.push(participant);
  groupBuy.committedLbs += requestedLbs;
  groupBuy.remainingLbs = Math.max(groupBuy.targetLbs - groupBuy.committedLbs, 0);
  if (groupBuy.status === "open") groupBuy.status = "funding";
  groupBuy.updatedAt = now;
  groupBuy.events.unshift({
    id: crypto.randomUUID(),
    eventType: "participant_joined",
    createdAt: now,
    payload: { requestedLbs, depositStatus: "pending" },
  });
  writeDb(db);
  return Promise.resolve(participant);
}

export function placeBid(id: string, input: BidInput, userId: string | null) {
  requireAccount(userId, "producer");
  const db = readDb();
  const groupBuy = db.groupBuys.find((item) => item.id === id);
  if (!groupBuy) throw new ApiError(404, "NOT_FOUND", "Group buy not found");
  if (!["open", "funding"].includes(groupBuy.status) || new Date() > new Date(groupBuy.bidDeadline)) {
    throw new ApiError(409, "BIDDING_CLOSED", "This group buy is no longer accepting bids");
  }
  const start = new Date(input.availabilityWindowStart);
  const end = new Date(input.availabilityWindowEnd);
  if (start > new Date(groupBuy.pickupWindowStart) || end < new Date(groupBuy.pickupWindowEnd) || start >= end) {
    throw new ApiError(400, "INVALID_AVAILABILITY", "Producer availability must cover the pickup window");
  }
  const now = new Date().toISOString();
  const bid = {
    id: crypto.randomUUID(),
    groupBuyId: id,
    producerId: userId!,
    pricePerLb: input.pricePerLb,
    availableLbs: input.availableLbs,
    availabilityWindowStart: input.availabilityWindowStart,
    availabilityWindowEnd: input.availabilityWindowEnd,
    notes: input.notes ?? null,
    status: "submitted" as const,
    createdAt: now,
  };
  groupBuy.bids.push(bid);
  groupBuy.bids.sort((a, b) => a.pricePerLb - b.pricePerLb);
  groupBuy.updatedAt = now;
  groupBuy.events.unshift({ id: crypto.randomUUID(), eventType: "bid_submitted", createdAt: now, payload: { bidId: bid.id } });
  writeDb(db);
  return Promise.resolve(bid);
}

export function selectBid(id: string, bidId: string, userId: string | null) {
  const actor = requireAccount(userId);
  const db = readDb();
  const groupBuy = db.groupBuys.find((item) => item.id === id);
  if (!groupBuy) throw new ApiError(404, "NOT_FOUND", "Group buy not found");
  if (groupBuy.createdBy !== actor.id) throw new ApiError(403, "FORBIDDEN", "Only the request owner can select a bid");
  if (groupBuy.status !== "funding" || new Date() > new Date(groupBuy.bidDeadline)) {
    throw new ApiError(409, "MATCHING_CLOSED", "This group buy cannot be matched");
  }
  if (groupBuy.selectedBidId) throw new ApiError(409, "ALREADY_MATCHED", "A bid has already been selected");
  const bid = groupBuy.bids.find((item) => item.id === bidId);
  if (!bid) throw new ApiError(404, "NOT_FOUND", "Bid not found");
  if (bid.availableLbs < groupBuy.committedLbs) throw new ApiError(409, "INSUFFICIENT_QUANTITY", "The bid must cover all committed pounds");
  if (groupBuy.committedLbs < groupBuy.targetLbs) {
    throw new ApiError(409, "THRESHOLD_NOT_MET", "The committed quantity has not reached the target");
  }
  const now = new Date().toISOString();
  for (const item of groupBuy.bids) {
    if (item.status === "submitted") item.status = "rejected";
  }
  bid.status = "selected";
  groupBuy.selectedBidId = bid.id;
  groupBuy.status = "matched";
  groupBuy.updatedAt = now;
  groupBuy.events.unshift({
    id: crypto.randomUUID(),
    eventType: "bid_selected",
    createdAt: now,
    payload: { bidId: bid.id, status: "matched" },
  });
  writeDb(db);
  return Promise.resolve({ groupBuyId: id, selectedBidId: bid.id, status: "matched" });
}

export function updateStatus(id: string, status: "cancelled" | "ready_for_pickup", userId: string | null) {
  const actor = requireAccount(userId, status === "ready_for_pickup" ? "producer" : undefined);
  const db = readDb();
  const groupBuy = db.groupBuys.find((item) => item.id === id);
  if (!groupBuy) throw new ApiError(404, "NOT_FOUND", "Group buy not found");
  const isOwner = groupBuy.createdBy === actor.id;
  const canCancel = status === "cancelled" && isOwner && ["open", "funding"].includes(groupBuy.status);
  const canReady = status === "ready_for_pickup" && actor.role === "producer" && groupBuy.status === "matched" && groupBuy.bids.some((bid) => bid.id === groupBuy.selectedBidId && bid.producerId === actor.id);
  if (!canCancel && !canReady) throw new ApiError(403, "FORBIDDEN", "User cannot make this status change");
  const now = new Date().toISOString();
  const previous = groupBuy.status;
  groupBuy.status = status;
  groupBuy.updatedAt = now;
  groupBuy.events.unshift({
    id: crypto.randomUUID(),
    eventType: `group_buy_${status}`,
    createdAt: now,
    payload: { from: previous, to: status },
  });
  writeDb(db);
  return Promise.resolve({ id, status });
}

export function listMine(userId: string | null): Promise<Mine> {
  if (!userId) return Promise.resolve({ created: [], joined: [], bids: [] });
  const details = readDb().groupBuys;
  return Promise.resolve({
    created: details.filter((item) => item.createdBy === userId).map(toSummary),
    joined: details.filter((item) => item.participants.some((person) => person.userId === userId)).map(toSummary),
    bids: details.filter((item) => item.bids.some((bid) => bid.producerId === userId)).map(toSummary),
  });
}

export async function updateDeposit(id: string, participantId: string, status: DepositStatus, userId: string | null) {
  const actor = requireAccount(userId);
  const db = readDb();
  const groupBuy = db.groupBuys.find((item) => item.id === id);
  if (!groupBuy) throw new ApiError(404, "NOT_FOUND", "Group buy not found");
  if (actor.id !== groupBuy.createdBy) throw new ApiError(403, "FORBIDDEN", "Only the organizer can update deposit records");
  const person = groupBuy.participants.find((item) => item.id === participantId);
  if (!person) throw new ApiError(404, "NOT_FOUND", "Participant not found");
  const valid = (person.depositStatus === "pending" && status === "confirmed_manual") || (person.depositStatus === "confirmed_manual" && ["refunded_manual", "forfeited_manual"].includes(status));
  if (!valid) throw new ApiError(409, "INVALID_DEPOSIT_STATUS", "Refresh to see the current deposit status");
  person.depositStatus = status;
  person.updatedAt = new Date().toISOString();
  groupBuy.events.unshift({ id: crypto.randomUUID(), eventType: `deposit_${status}`, createdAt: person.updatedAt, payload: { participantId, status } });
  groupBuy.updatedAt = person.updatedAt;
  writeDb(db);
}

export async function completePickup(id: string, participantId: string, userId: string | null) {
  const actor = requireAccount(userId);
  const db = readDb();
  const groupBuy = db.groupBuys.find((item) => item.id === id);
  if (!groupBuy) throw new ApiError(404, "NOT_FOUND", "Group buy not found");
  const person = groupBuy.participants.find((item) => item.id === participantId);
  if (!person) throw new ApiError(404, "NOT_FOUND", "Participant not found");
  const producer = groupBuy.bids.find((bid) => bid.id === groupBuy.selectedBidId)?.producerId;
  if (actor.id !== person.userId && actor.id !== producer) throw new ApiError(403, "FORBIDDEN", "Only the participant or selected producer can confirm pickup");
  if (person.completionStatus === "completed") return;
  if (groupBuy.status !== "ready_for_pickup") throw new ApiError(409, "NOT_READY", "Wait until the producer marks this group buy ready");
  person.completionStatus = "completed";
  person.completedAt = person.updatedAt = new Date().toISOString();
  groupBuy.updatedAt = person.updatedAt;
  groupBuy.events.unshift({ id: crypto.randomUUID(), eventType: "pickup_completed", createdAt: person.updatedAt, payload: { participantId, method: "manual" } });
  if (groupBuy.participants.every((item) => item.completionStatus === "completed")) {
    groupBuy.status = "completed";
    groupBuy.events.unshift({ id: crypto.randomUUID(), eventType: "group_buy_completed", createdAt: person.updatedAt, payload: {} });
  }
  writeDb(db);
}
