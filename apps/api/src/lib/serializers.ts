import {
  BID_STATUSES,
  centsToUsd,
  COMPLETION_STATUSES,
  DEPOSIT_STATUSES,
  EVENT_TYPES,
  GROUP_BUY_STATUSES,
  hundredthsToLbs,
  isOneOf,
  type BidDto,
  type DepositSummary,
  type EventDto,
  type GroupBuyDetail,
  type GroupBuySummary,
  type OrgType,
  type ParticipantDto,
  type PickupLocationDto,
  type ProduceTypeDto,
  type Role,
  type UserProfile,
} from "@curbstand/shared";
import type { Prisma } from "@prisma/client";

export const userProfileInclude = {
  producerProfile: { include: { produceTypes: { select: { produceTypeId: true } } } },
} satisfies Prisma.UserInclude;

type UserWithProfile = Prisma.UserGetPayload<{ include: typeof userProfileInclude }>;

export function toUserProfile(user: UserWithProfile): UserProfile {
  const p = user.producerProfile;
  return {
    id: user.id,
    role: user.role as Role,
    isOperator: user.isOperator,
    name: user.name,
    email: user.email,
    phone: user.phone,
    orgType: (user.orgType as OrgType | null) ?? null,
    producerProfile: p
      ? {
          farmName: p.farmName,
          produceTypes: p.produceTypes.map((t) => t.produceTypeId).sort(),
          serviceRadiusMiles: p.serviceRadiusMiles,
          farmLatitude: p.farmLatitude,
          farmLongitude: p.farmLongitude,
        }
      : null,
    createdAt: user.createdAt.toISOString(),
  };
}

// ---------- Group buys, participants, bids, events ----------
// Map Prisma rows (with the matching `*Include`) to the DTOs in @curbstand/shared.
// Unknown status strings in the DB throw rather than being passed through silently.


function asEnum<T extends string>(list: readonly T[], value: string, field: string): T {
  if (!isOneOf(list, value)) throw new Error(`Unexpected ${field} in database: ${value}`);
  return value;
}

export const bidInclude = {
  producer: { select: { producerProfile: { select: { farmName: true } } } },
} satisfies Prisma.BidInclude;

export const participantInclude = {
  user: { select: { name: true } },
} satisfies Prisma.GroupBuyParticipantInclude;

export const groupBuySummaryInclude = {
  produceType: true,
  pickupLocation: true,
  participants: { select: { requestedLbsX100: true } },
} satisfies Prisma.GroupBuyInclude;

export const groupBuyDetailInclude = {
  produceType: true,
  pickupLocation: true,
  participants: { include: participantInclude, orderBy: { createdAt: "asc" } },
  selectedBid: { include: bidInclude },
  events: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.GroupBuyInclude;

type BidRow = Prisma.BidGetPayload<{ include: typeof bidInclude }>;
type ParticipantRow = Prisma.GroupBuyParticipantGetPayload<{ include: typeof participantInclude }>;
type GroupBuySummaryRow = Prisma.GroupBuyGetPayload<{ include: typeof groupBuySummaryInclude }>;
type GroupBuyDetailRow = Prisma.GroupBuyGetPayload<{ include: typeof groupBuyDetailInclude }>;
type EventRow = Prisma.EventGetPayload<object>;

export function toProduceType(row: Prisma.ProduceTypeGetPayload<object>): ProduceTypeDto {
  return { id: row.id, name: row.name, category: row.category as ProduceTypeDto["category"] };
}

export function toPickupLocation(row: Prisma.PickupLocationGetPayload<object>): PickupLocationDto {
  return {
    id: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/** Committed quantity, in lbs×100, from participant rows. */
export function committedLbsX100(participants: readonly { requestedLbsX100: number }[]): number {
  return participants.reduce((sum, p) => sum + p.requestedLbsX100, 0);
}

export function toGroupBuySummary(row: GroupBuySummaryRow | GroupBuyDetailRow): GroupBuySummary {
  const committed = committedLbsX100(row.participants);
  return {
    id: row.id,
    status: asEnum(GROUP_BUY_STATUSES, row.status, "group buy status"),
    produceType: toProduceType(row.produceType),
    pickupLocation: toPickupLocation(row.pickupLocation),
    targetLbs: hundredthsToLbs(row.targetLbsX100),
    committedLbs: hundredthsToLbs(committed),
    remainingLbs: hundredthsToLbs(Math.max(row.targetLbsX100 - committed, 0)),
    participantCount: row.participants.length,
    pickupWindowStart: row.pickupWindowStart.toISOString(),
    pickupWindowEnd: row.pickupWindowEnd.toISOString(),
    joinDeadline: row.joinDeadline.toISOString(),
    bidDeadline: row.bidDeadline.toISOString(),
    createdById: row.createdById,
    selectedBidId: row.selectedBidId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toParticipant(row: ParticipantRow): ParticipantDto {
  return {
    id: row.id,
    groupBuyId: row.groupBuyId,
    userId: row.userId,
    userName: row.user.name,
    requestedLbs: hundredthsToLbs(row.requestedLbsX100),
    depositAmountUsd: centsToUsd(row.depositAmountCents),
    depositStatus: asEnum(DEPOSIT_STATUSES, row.depositStatus, "deposit status"),
    depositUpdatedAt: row.depositUpdatedAt.toISOString(),
    completionStatus: asEnum(COMPLETION_STATUSES, row.completionStatus, "completion status"),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBid(row: BidRow): BidDto {
  const farmName = row.producer.producerProfile?.farmName;
  if (!farmName) throw new Error(`Bid ${row.id} producer has no producer profile`);
  return {
    id: row.id,
    groupBuyId: row.groupBuyId,
    producerId: row.producerId,
    producerFarmName: farmName,
    pricePerLbUsd: centsToUsd(row.priceCentsPerLb),
    availableLbs: hundredthsToLbs(row.availableLbsX100),
    availabilityWindowStart: row.availabilityWindowStart.toISOString(),
    availabilityWindowEnd: row.availabilityWindowEnd.toISOString(),
    notes: row.notes,
    status: asEnum(BID_STATUSES, row.status, "bid status"),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toEvent(row: EventRow): EventDto {
  return {
    id: row.id,
    groupBuyId: row.groupBuyId,
    actorUserId: row.actorUserId,
    eventType: asEnum(EVENT_TYPES, row.eventType, "event type"),
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDepositSummary(
  participants: readonly { depositAmountCents: number; depositStatus: string }[],
  amountPerParticipantCents: number,
): DepositSummary {
  const counts = Object.fromEntries(DEPOSIT_STATUSES.map((s) => [s, 0])) as DepositSummary["countsByStatus"];
  const totals = Object.fromEntries(DEPOSIT_STATUSES.map((s) => [s, 0])) as Record<keyof typeof counts, number>;
  for (const p of participants) {
    const status = asEnum(DEPOSIT_STATUSES, p.depositStatus, "deposit status");
    counts[status] += 1;
    totals[status] += p.depositAmountCents;
  }
  return {
    simulated: true,
    amountPerParticipantUsd: centsToUsd(amountPerParticipantCents),
    countsByStatus: counts,
    totalsByStatusUsd: Object.fromEntries(
      DEPOSIT_STATUSES.map((s) => [s, centsToUsd(totals[s])]),
    ) as DepositSummary["totalsByStatusUsd"],
  };
}

/** Full detail view for `viewerId` (their own participation is surfaced as `myParticipation`). */
export function toGroupBuyDetail(
  row: GroupBuyDetailRow,
  viewerId: string | null,
  amountPerParticipantCents: number,
): GroupBuyDetail {
  const participants = row.participants.map(toParticipant);
  return {
    ...toGroupBuySummary(row),
    selectedBid: row.selectedBid ? toBid(row.selectedBid) : null,
    myParticipation: participants.find((p) => p.userId === viewerId) ?? null,
    participants,
    depositSummary: toDepositSummary(row.participants, amountPerParticipantCents),
    events: row.events.map(toEvent),
  };
}
