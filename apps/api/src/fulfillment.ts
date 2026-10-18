import { centsToUsd, hundredthsToLbs, lbsToHundredths, usdToCents, type EventType as SharedEventType } from "@curbstand/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createFulfillmentApi } from "../../../packages/fulfillment/src/api";
import { createGeminiEstimator } from "../../../packages/fulfillment/src/benchmark/gemini";
import { demoSampleEstimate } from "../../../packages/fulfillment/src/benchmark/sample";
import { issueCheckInToken } from "../../../packages/fulfillment/src/checkin";
import { refundConfirmedDeposits } from "../../../packages/fulfillment/src/deposits";
import { FulfillmentError } from "../../../packages/fulfillment/src/errors";
import { safeEqual, sha256Hex } from "../../../packages/fulfillment/src/hash";
import type { CheckInTokenStore, FulfillmentRepository } from "../../../packages/fulfillment/src/repository";
import {
  REGION,
  type Actor,
  type BaselineRecord,
  type BenchmarkRecord,
  type EventRecord,
  type EventType,
  type GroupBuyRecord,
  type GroupBuyStatus,
  type ParticipantRecord,
  type Region,
} from "../../../packages/fulfillment/src/types";
import type { AuthUser } from "./auth/guards";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "./lib/errors";
import { prisma } from "./lib/db";

const groupBuyInclude = { produceType: true, pickupLocation: true, selectedBid: true } satisfies Prisma.GroupBuyInclude;
type GroupBuyRow = Prisma.GroupBuyGetPayload<{ include: typeof groupBuyInclude }>;
type ParticipantRow = Prisma.GroupBuyParticipantGetPayload<object>;

const TO_SHARED_EVENT: Record<EventType, SharedEventType> = {
  deposit_intent_recorded: "deposit.status_changed",
  deposit_confirmed_manual: "deposit.status_changed",
  deposit_refunded_manual: "deposit.status_changed",
  deposit_forfeited_manual: "deposit.status_changed",
  participant_checked_in: "participant.checked_in",
  group_buy_completed: "group_buy.completed",
  group_buy_cancelled: "group_buy.cancelled",
};

function iso(value: Date) {
  return value.toISOString();
}

function payloadRecord(payload: string): Record<string, string> {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === null || value === undefined) continue;
      result[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    return result;
  } catch {
    return {};
  }
}

function fromSharedEvent(eventType: string, payload: Record<string, string>): EventType | null {
  if (eventType === "participant.checked_in") return "participant_checked_in";
  if (eventType === "group_buy.completed") return "group_buy_completed";
  if (eventType === "group_buy.cancelled") return "group_buy_cancelled";
  if (eventType !== "deposit.status_changed") return null;
  if (payload.depositStatus === "pending") return "deposit_intent_recorded";
  if (payload.depositStatus === "confirmed_manual") return "deposit_confirmed_manual";
  if (payload.depositStatus === "refunded_manual") return "deposit_refunded_manual";
  if (payload.depositStatus === "forfeited_manual") return "deposit_forfeited_manual";
  return null;
}

function completionFromDb(status: string): Pick<ParticipantRecord, "completionStatus" | "completionMethod"> {
  if (status === "checked_in_qr") return { completionStatus: "completed", completionMethod: "qr" };
  if (status === "checked_in_manual") return { completionStatus: "completed", completionMethod: "manual" };
  return { completionStatus: "pending", completionMethod: null };
}

function completionToDb(participant: ParticipantRecord) {
  if (participant.completionStatus !== "completed") return "pending";
  return participant.completionMethod === "qr" ? "checked_in_qr" : "checked_in_manual";
}

async function toParticipant(row: ParticipantRow): Promise<ParticipantRecord> {
  const completion = completionFromDb(row.completionStatus);
  return {
    id: row.id,
    groupBuyId: row.groupBuyId,
    userId: row.userId,
    requestedLbs: hundredthsToLbs(row.requestedLbsX100),
    depositAmount: centsToUsd(row.depositAmountCents),
    depositStatus: row.depositStatus as ParticipantRecord["depositStatus"],
    ...completion,
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    checkInTokenHash: row.checkInToken ? await sha256Hex(row.checkInToken) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toGroupBuy(row: GroupBuyRow): GroupBuyRecord {
  return {
    id: row.id,
    produceType: row.produceTypeId,
    region: REGION,
    status: row.status as GroupBuyStatus,
    createdBy: row.createdById,
    selectedBid: row.selectedBid
      ? { id: row.selectedBid.id, producerId: row.selectedBid.producerId, pricePerLb: centsToUsd(row.selectedBid.priceCentsPerLb) }
      : null,
    pickupLocationLabel: row.pickupLocation.name,
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * The shared schema stores the QR secret on `GroupBuyParticipant.checkInToken`.
 * Serializers omit that column. The domain port still sees only a hash.
 */
export class PrismaFulfillmentRepository implements FulfillmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async getGroupBuy(id: string) {
    const row = await this.db.groupBuy.findUnique({ where: { id }, include: groupBuyInclude });
    return row ? toGroupBuy(row) : null;
  }

  async saveGroupBuy(groupBuy: GroupBuyRecord) {
    await this.db.groupBuy.update({
      where: { id: groupBuy.id },
      data: { status: groupBuy.status, updatedAt: new Date(groupBuy.updatedAt) },
    });
  }

  async listParticipants(groupBuyId: string) {
    const rows = await this.db.groupBuyParticipant.findMany({
      where: { groupBuyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return Promise.all(rows.map((row) => toParticipant(row)));
  }

  async getParticipant(id: string) {
    const row = await this.db.groupBuyParticipant.findUnique({ where: { id } });
    return row ? toParticipant(row) : null;
  }

  async saveParticipant(participant: ParticipantRecord) {
    await this.db.groupBuyParticipant.update({
      where: { id: participant.id },
      data: {
        requestedLbsX100: lbsToHundredths(participant.requestedLbs),
        depositAmountCents: participant.depositAmount ? usdToCents(participant.depositAmount) : undefined,
        depositStatus: participant.depositStatus ?? undefined,
        depositUpdatedAt: new Date(participant.updatedAt),
        completionStatus: completionToDb(participant),
        completedAt: participant.completedAt ? new Date(participant.completedAt) : null,
        updatedAt: new Date(participant.updatedAt),
      },
    });
  }

  async findParticipantByTokenHash(groupBuyId: string, tokenHash: string) {
    const rows = await this.db.groupBuyParticipant.findMany({ where: { groupBuyId, checkInToken: { not: null } } });
    for (const row of rows) {
      if (!row.checkInToken) continue;
      if (safeEqual(await sha256Hex(row.checkInToken), tokenHash)) return toParticipant(row);
    }
    return null;
  }

  async listEvents(groupBuyId: string): Promise<EventRecord[]> {
    const rows = await this.db.event.findMany({
      where: { groupBuyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const events: EventRecord[] = [];
    for (const row of rows) {
      const payload = payloadRecord(row.payload);
      const eventType = fromSharedEvent(row.eventType, payload);
      if (!eventType) continue;
      events.push({
        id: row.id,
        groupBuyId: row.groupBuyId,
        actorUserId: row.actorUserId ?? "",
        eventType,
        payload,
        createdAt: iso(row.createdAt),
      });
    }
    return events;
  }

  async appendEvent(event: EventRecord) {
    await this.db.event.create({
      data: {
        id: event.id,
        groupBuyId: event.groupBuyId,
        actorUserId: event.actorUserId,
        eventType: TO_SHARED_EVENT[event.eventType],
        payload: JSON.stringify(event.payload),
        createdAt: new Date(event.createdAt),
      },
    });
  }

  async getFreshBenchmark(produceType: string, region: Region, now: Date) {
    const row = await this.db.priceBenchmark.findFirst({
      where: { produceType, region, expiresAt: { gt: now } },
      orderBy: { retrievedAt: "desc" },
    });
    return row ? toBenchmark(row) : null;
  }

  async getLatestBenchmark(produceType: string, region: Region) {
    const row = await this.db.priceBenchmark.findFirst({
      where: { produceType, region },
      orderBy: { retrievedAt: "desc" },
    });
    return row ? toBenchmark(row) : null;
  }

  async saveBenchmark(record: BenchmarkRecord) {
    await this.db.priceBenchmark.create({
      data: {
        id: record.id,
        produceType: record.produceType,
        region: record.region,
        currency: record.currency,
        unit: record.unit,
        retailLow: record.retailLow,
        retailHigh: record.retailHigh,
        source: record.source,
        model: record.model,
        promptVersion: record.promptVersion,
        promptHash: record.promptHash,
        responseJson: JSON.stringify(record.responseJson),
        retrievedAt: new Date(record.retrievedAt),
        expiresAt: new Date(record.expiresAt),
      },
    });
  }

  async getBaseline(produceType: string, region: Region) {
    const row = await this.db.distributionCenterBaseline.findUnique({
      where: { produceType_region: { produceType, region } },
    });
    if (!row) return null;
    const baseline: BaselineRecord = {
      produceType: row.produceType,
      region: row.region as Region,
      currency: "USD",
      baselinePerLb: row.baselinePerLb,
      updatedAt: iso(row.updatedAt),
    };
    return baseline;
  }

  async saveBaseline(record: BaselineRecord) {
    await this.db.distributionCenterBaseline.upsert({
      where: { produceType_region: { produceType: record.produceType, region: record.region } },
      create: { ...record, updatedAt: new Date(record.updatedAt) },
      update: { baselinePerLb: record.baselinePerLb, currency: record.currency, updatedAt: new Date(record.updatedAt) },
    });
  }
}

export class PrismaTokenStore implements CheckInTokenStore {
  constructor(private readonly db: PrismaClient) {}

  async save(participantId: string, token: string) {
    await this.db.groupBuyParticipant.update({ where: { id: participantId }, data: { checkInToken: token } });
  }

  async get(participantId: string) {
    const row = await this.db.groupBuyParticipant.findUnique({ where: { id: participantId }, select: { checkInToken: true } });
    return row?.checkInToken ?? null;
  }
}

function toBenchmark(row: {
  id: string;
  produceType: string;
  region: string;
  retailLow: string;
  retailHigh: string;
  source: string;
  model: string;
  promptVersion: string;
  promptHash: string;
  responseJson: string;
  retrievedAt: Date;
  expiresAt: Date;
}): BenchmarkRecord {
  return {
    id: row.id,
    produceType: row.produceType,
    region: row.region as Region,
    currency: "USD",
    unit: "lb",
    retailLow: row.retailLow,
    retailHigh: row.retailHigh,
    source: row.source === "gemini" ? "gemini" : "demo_sample",
    model: row.model,
    promptVersion: row.promptVersion,
    promptHash: row.promptHash,
    responseJson: JSON.parse(row.responseJson) as BenchmarkRecord["responseJson"],
    retrievedAt: iso(row.retrievedAt),
    expiresAt: iso(row.expiresAt),
  };
}

export function toFulfillmentActor(user: AuthUser): Actor {
  return { userId: user.id, role: user.isOperator ? "operator" : user.role };
}

export function rethrowFulfillment(error: unknown): never {
  if (error instanceof FulfillmentError) {
    if (error.status === 401) throw unauthorized(error.message);
    if (error.status === 403) throw forbidden(error.message);
    if (error.status === 404) throw notFound(error.message);
    if (error.status === 409) throw conflict(error.message);
    throw badRequest(error.message);
  }
  throw error;
}

export function createFulfillmentServices(db: PrismaClient = prisma) {
  const repo = new PrismaFulfillmentRepository(db);
  const tokens = new PrismaTokenStore(db);
  const gemini = process.env.GEMINI_API_KEY
    ? createGeminiEstimator({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      })
    : null;
  const handle = createFulfillmentApi({
    repo,
    tokens,
    now: () => new Date(),
    priceComparisonEnabled: () => process.env.PRICE_COMPARISON_ENABLED !== "false",
    estimateMode: () => (process.env.GEMINI_API_KEY ? "gemini" : "demo_sample"),
    estimate: (input) => (gemini ? gemini(input) : demoSampleEstimate(input)),
  });
  return { repo, tokens, handle };
}

let services: ReturnType<typeof createFulfillmentServices> | null = null;

export function fulfillmentServices() {
  services ??= createFulfillmentServices();
  return services;
}

export async function refundDepositsForCancel(actor: Actor, groupBuyId: string) {
  try {
    await refundConfirmedDeposits(fulfillmentServices().repo, actor, groupBuyId, new Date());
  } catch (error) {
    rethrowFulfillment(error);
  }
}

export async function issueReadyCheckInTokens(groupBuyId: string, ownerUserId: string) {
  const { repo, tokens } = fulfillmentServices();
  const participants = await repo.listParticipants(groupBuyId);
  for (const participant of participants) {
    if (participant.checkInTokenHash) continue;
    try {
      await issueCheckInToken(repo, tokens, { userId: ownerUserId, role: "customer" }, participant.id, new Date());
    } catch (error) {
      rethrowFulfillment(error);
    }
  }
}
