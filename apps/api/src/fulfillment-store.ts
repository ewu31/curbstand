import { Prisma, type PrismaClient } from "@curbstand/db";
import type { CheckInTokenStore, FulfillmentRepository } from "../../../packages/fulfillment/src/repository.ts";
import { REGION, type BaselineRecord, type BenchmarkRecord, type EventRecord, type EventType, type GroupBuyRecord, type GroupBuyStatus, type ParticipantRecord, type Region } from "../../../packages/fulfillment/src/types.ts";

const groupBuyInclude = { pickupLocation: true, selectedBid: true } satisfies Prisma.GroupBuyInclude;
type GroupBuyRow = Prisma.GroupBuyGetPayload<{ include: typeof groupBuyInclude }>;
type ParticipantRow = Prisma.GroupBuyParticipantGetPayload<{}>;

function iso(value: Date) {
  return value.toISOString();
}

function toGroupBuy(row: GroupBuyRow): GroupBuyRecord {
  return {
    id: row.id,
    produceType: row.produceType,
    region: REGION,
    status: row.status as GroupBuyStatus,
    createdBy: row.createdBy,
    selectedBid: row.selectedBid
      ? { id: row.selectedBid.id, producerId: row.selectedBid.producerId, pricePerLb: row.selectedBid.pricePerLb }
      : null,
    pickupLocationLabel: row.pickupLocation.name,
    updatedAt: iso(row.updatedAt),
  };
}

function toParticipant(row: ParticipantRow): ParticipantRecord {
  return {
    id: row.id,
    groupBuyId: row.groupBuyId,
    userId: row.userId,
    requestedLbs: row.requestedLbs,
    depositAmount: row.depositAmount,
    depositStatus: row.depositStatus as ParticipantRecord["depositStatus"],
    completionStatus: row.completionStatus === "completed" ? "completed" : "pending",
    completionMethod: row.completionMethod === "qr" || row.completionMethod === "manual" ? row.completionMethod : null,
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    checkInTokenHash: row.checkInTokenHash,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function payloadRecord(payload: string): Record<string, string> {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry) => entry[1] !== null && entry[1] !== undefined)
        .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
    );
  } catch {
    return {};
  }
}

function toBenchmark(row: {
  id: string;
  produceType: string;
  region: string;
  currency: string;
  unit: string;
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
  const responseJson = JSON.parse(row.responseJson) as BenchmarkRecord["responseJson"];
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
    responseJson,
    retrievedAt: iso(row.retrievedAt),
    expiresAt: iso(row.expiresAt),
  };
}

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
    return rows.map(toParticipant);
  }

  async getParticipant(id: string) {
    const row = await this.db.groupBuyParticipant.findUnique({ where: { id } });
    return row ? toParticipant(row) : null;
  }

  async saveParticipant(participant: ParticipantRecord) {
    await this.db.groupBuyParticipant.update({
      where: { id: participant.id },
      data: {
        requestedLbs: participant.requestedLbs,
        depositAmount: participant.depositAmount ?? undefined,
        depositStatus: participant.depositStatus ?? undefined,
        completionStatus: participant.completionStatus,
        completionMethod: participant.completionMethod,
        completedAt: participant.completedAt ? new Date(participant.completedAt) : null,
        checkInTokenHash: participant.checkInTokenHash,
        updatedAt: new Date(participant.updatedAt),
      },
    });
  }

  async findParticipantByTokenHash(groupBuyId: string, tokenHash: string) {
    const row = await this.db.groupBuyParticipant.findFirst({ where: { groupBuyId, checkInTokenHash: tokenHash } });
    return row ? toParticipant(row) : null;
  }

  async listEvents(groupBuyId: string): Promise<EventRecord[]> {
    const rows = await this.db.event.findMany({
      where: { groupBuyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      groupBuyId: row.groupBuyId,
      actorUserId: row.actorUserId ?? "",
      eventType: row.eventType as EventType,
      payload: payloadRecord(row.payload),
      createdAt: iso(row.createdAt),
    }));
  }

  async appendEvent(event: EventRecord) {
    await this.db.event.create({
      data: {
        id: event.id,
        groupBuyId: event.groupBuyId,
        actorUserId: event.actorUserId,
        eventType: event.eventType,
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
        ...record,
        responseJson: JSON.stringify(record.responseJson),
        retrievedAt: new Date(record.retrievedAt),
        expiresAt: new Date(record.expiresAt),
      },
    });
  }

  async getBaseline(produceType: string, region: Region) {
    const row = await this.db.distributionCenterBaseline.findUnique({ where: { produceType_region: { produceType, region } } });
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
    await this.db.checkInToken.upsert({
      where: { participantId },
      create: { participantId, token },
      update: { token },
    });
  }

  async get(participantId: string) {
    const row = await this.db.checkInToken.findUnique({ where: { participantId } });
    return row?.token ?? null;
  }
}
