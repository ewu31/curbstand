import { demoUsers } from "./demo-accounts";
import { readSession } from "./session";
import { ApiError } from "./api-error";
import { createFixtureDetails, fixtureLocations, fixtureProduce, toSummary } from "./fixtures";
import type { Catalog, CreateGroupBuyInput, DepositStatus, DropProduct, GroupBuyDetail, Mine, PickupLocation, Role } from "./types";

const STORAGE_KEY = "curbstand.drops.v2";
const IN_PROGRESS = new Set(["open", "funding", "matched", "ready_for_pickup"]);

type FixtureDb = { groupBuys: GroupBuyDetail[] };

function readDb(): FixtureDb {
  const base = { groupBuys: createFixtureDetails().map(row => ({ ...row,
    status: row.committedLbs >= row.targetLbs && ["open", "funding"].includes(row.status) ? "matched" as const : row.status,
    events: row.events.filter(event => !event.eventType.startsWith("bid")), bids: [],
  })) };
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
  const account = requireAccount(userId, "producer");
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
  const offeredProducts: DropProduct[] = (input.products?.length ? input.products : [{
    produceType: input.produceType,
    pricePerLb: input.pricePerLb ?? 0,
    availableLbs: input.targetLbs,
  }]).map((product, index) => ({ ...product, id: `${crypto.randomUUID()}-${index}` }));
  const primary = offeredProducts[0];
  const sellerPhoto: string = "photoUrl" in account && account.photoUrl ? account.photoUrl : "/avatars/guest.svg";
  const groupBuy: GroupBuyDetail = {
    id: crypto.randomUUID(),
    produceType: input.produceType,
    targetLbs: input.targetLbs,
    pricePerLb: primary.pricePerLb,
    seller: { id: account.id ?? undefined, name: account.name, photoUrl: sellerPhoto },
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
    products: offeredProducts,
    imageUrls: input.imageUrls ?? [],
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
  groupBuy.status = groupBuy.committedLbs >= groupBuy.targetLbs ? "matched" : "funding";
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

export function updateStatus(id: string, status: "cancelled" | "ready_for_pickup", userId: string | null) {
  const actor = requireAccount(userId, status === "ready_for_pickup" ? "producer" : undefined);
  const db = readDb();
  const groupBuy = db.groupBuys.find((item) => item.id === id);
  if (!groupBuy) throw new ApiError(404, "NOT_FOUND", "Group buy not found");
  const isOwner = groupBuy.createdBy === actor.id;
  const canCancel = status === "cancelled" && isOwner && ["open", "funding"].includes(groupBuy.status);
  const canReady = status === "ready_for_pickup" && actor.role === "producer" && groupBuy.status === "matched" && isOwner;
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
  const producer = groupBuy.createdBy;
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
