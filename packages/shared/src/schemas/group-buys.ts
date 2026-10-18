import { z } from "zod";
import {
  GROUP_BUY_STATUSES,
  type BidStatus,
  type CompletionStatus,
  type DepositStatus,
  type EventType,
  type GroupBuyStatus,
} from "../enums";
import { PICKUP_LOCATIONS, PRODUCE_TYPE_IDS, type PickupLocationSeed, type ProduceTypeSeed } from "../catalog";
import { positiveLbsSchema, positiveUsdAmountSchema } from "../units";
import { isoDateTimeSchema } from "../time";

// Wire contract for group buys, participants, bids, and events (Tasks 2–4).
// Request schemas parse API strings into storage units (cents, lbs×100, Date).
// Response DTOs use 2-decimal strings for money/quantity and ISO UTC strings for time.
// Every status field is always present; clients must not infer state from a missing field.

const produceTypeId = z.enum(PRODUCE_TYPE_IDS as [string, ...string[]]);
const pickupLocationId = z.enum(PICKUP_LOCATIONS.map((l) => l.id) as [string, ...string[]]);
const id = z.string().min(1);

// ---------- Requests ----------

/** Query for GET /group-buys. Omitted filters mean "any". */
export const listGroupBuysQuerySchema = z.object({
  produceType: produceTypeId.optional(),
  locationId: pickupLocationId.optional(),
  status: z.enum(GROUP_BUY_STATUSES).optional(),
});

/**
 * POST /group-buys. Schedule must satisfy:
 *   joinDeadline < bidDeadline <= pickupWindowStart < pickupWindowEnd
 * "Is the deadline in the future" depends on the server clock, so it is checked by the route.
 */
export const createGroupBuySchema = z
  .object({
    produceType: produceTypeId,
    targetLbs: positiveLbsSchema,
    pickupLocationId,
    pickupWindowStart: isoDateTimeSchema,
    pickupWindowEnd: isoDateTimeSchema,
    joinDeadline: isoDateTimeSchema,
    bidDeadline: isoDateTimeSchema,
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.pickupWindowEnd <= v.pickupWindowStart) issue("pickupWindowEnd", "Must be after pickupWindowStart");
    if (v.bidDeadline > v.pickupWindowStart) issue("bidDeadline", "Must be on or before pickupWindowStart");
    if (v.joinDeadline >= v.bidDeadline) issue("joinDeadline", "Must be before bidDeadline");
  });
export type CreateGroupBuyInput = z.input<typeof createGroupBuySchema>;

/** POST /group-buys/:id/participants */
export const joinGroupBuySchema = z.object({
  requestedLbs: positiveLbsSchema,
});
export type JoinGroupBuyInput = z.input<typeof joinGroupBuySchema>;

/** PATCH /group-buys/:id/status — only manually requested transitions; others happen as side effects. */
export const updateGroupBuyStatusSchema = z.object({
  status: z.enum(["ready_for_pickup", "cancelled"]),
  reason: z.string().trim().max(500).optional(),
});
export type UpdateGroupBuyStatusInput = z.input<typeof updateGroupBuyStatusSchema>;

/** POST /group-buys/:id/bids. The availability window must also cover the pickup window (checked by the route). */
export const createBidSchema = z
  .object({
    pricePerLbUsd: positiveUsdAmountSchema,
    availableLbs: positiveLbsSchema,
    availabilityWindowStart: isoDateTimeSchema,
    availabilityWindowEnd: isoDateTimeSchema,
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.availabilityWindowEnd > v.availabilityWindowStart, {
    path: ["availabilityWindowEnd"],
    message: "Must be after availabilityWindowStart",
  });
export type CreateBidInput = z.input<typeof createBidSchema>;

/** POST /group-buys/:id/select-bid */
export const selectBidSchema = z.object({ bidId: id });
export type SelectBidInput = z.input<typeof selectBidSchema>;

// ---------- Responses ----------

export type ProduceTypeDto = ProduceTypeSeed;
export type PickupLocationDto = PickupLocationSeed;

export interface GroupBuySummary {
  id: string;
  status: GroupBuyStatus;
  produceType: ProduceTypeDto;
  pickupLocation: PickupLocationDto;
  /** lbs, 2-decimal string */
  targetLbs: string;
  /** Sum of all participants' requestedLbs */
  committedLbs: string;
  /** max(target - committed, 0) */
  remainingLbs: string;
  participantCount: number;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  joinDeadline: string;
  bidDeadline: string;
  createdById: string;
  selectedBidId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantDto {
  id: string;
  groupBuyId: string;
  userId: string;
  /** Display name only; no contact details. */
  userName: string;
  requestedLbs: string;
  depositAmountUsd: string;
  depositStatus: DepositStatus;
  depositUpdatedAt: string;
  completionStatus: CompletionStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BidDto {
  id: string;
  groupBuyId: string;
  producerId: string;
  producerFarmName: string;
  pricePerLbUsd: string;
  availableLbs: string;
  availabilityWindowStart: string;
  availabilityWindowEnd: string;
  notes: string | null;
  status: BidStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EventDto {
  id: string;
  groupBuyId: string;
  actorUserId: string | null;
  eventType: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Deposits are simulated: these are recorded intents, never money collected. */
export interface DepositSummary {
  simulated: true;
  amountPerParticipantUsd: string;
  countsByStatus: Record<DepositStatus, number>;
  /** Sum of deposit intents per status, USD 2-decimal strings */
  totalsByStatusUsd: Record<DepositStatus, string>;
}

export interface GroupBuyDetail extends GroupBuySummary {
  selectedBid: BidDto | null;
  /** The caller's own participation, or null if they have not joined. */
  myParticipation: ParticipantDto | null;
  participants: ParticipantDto[];
  depositSummary: DepositSummary;
  /** Oldest first */
  events: EventDto[];
}

// Envelopes: one named key per resource, matching `{ user }` from /me.
export interface ListGroupBuysResponse { groupBuys: GroupBuySummary[] }
export interface GroupBuyResponse { groupBuy: GroupBuyDetail }
export interface ParticipantResponse { participant: ParticipantDto }
export interface BidResponse { bid: BidDto }
/** Sorted by pricePerLbUsd ascending */
export interface ListBidsResponse { bids: BidDto[] }
export interface ProduceTypesResponse { produceTypes: ProduceTypeDto[] }
export interface PickupLocationsResponse { pickupLocations: PickupLocationDto[] }
