import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { Prisma, PrismaClient } from "@curbstand/db";

const dateSchema = z.string().datetime({ offset: true });
const positiveDecimal = z.number().finite().positive();
const createGroupBuySchema = z.object({
  produceType: z.string().min(1).max(80),
  targetLbs: positiveDecimal,
  pickupLocationId: z.string().uuid(),
  pickupWindowStart: dateSchema,
  pickupWindowEnd: dateSchema,
  joinDeadline: dateSchema,
  bidDeadline: dateSchema,
});
const participantSchema = z.object({ requestedLbs: positiveDecimal });
const bidSchema = z.object({
  pricePerLb: positiveDecimal,
  availableLbs: positiveDecimal,
  availabilityWindowStart: dateSchema,
  availabilityWindowEnd: dateSchema,
  notes: z.string().max(2000).optional(),
});
const statusSchema = z.object({ status: z.enum(["cancelled", "ready_for_pickup"]) });

type User = Awaited<ReturnType<PrismaClient["user"]["findUnique"]>>;
type GroupBuyWithLocation = Prisma.GroupBuyGetPayload<{
  include: { pickupLocation: true };
}>;
type Bid = Prisma.BidGetPayload<{}>;
type Reply = FastifyReply;

function sendError(reply: Reply, status: 400 | 401 | 403 | 404 | 409, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

function parseDate(value: string) {
  return new Date(value);
}

function fixed(value: number) {
  return value.toFixed(2);
}

function numeric(value: string) {
  return Number(value);
}

function assertChronology(values: {
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  joinDeadline: Date;
  bidDeadline: Date;
}) {
  return values.pickupWindowStart < values.pickupWindowEnd &&
    values.joinDeadline < values.bidDeadline &&
    values.bidDeadline <= values.pickupWindowStart;
}

function serializeBid(bid: Bid) {
  return {
    id: bid.id,
    groupBuyId: bid.groupBuyId,
    producerId: bid.producerId,
    pricePerLb: numeric(bid.pricePerLb),
    availableLbs: numeric(bid.availableLbs),
    availabilityWindowStart: bid.availabilityWindowStart.toISOString(),
    availabilityWindowEnd: bid.availabilityWindowEnd.toISOString(),
    notes: bid.notes,
    status: bid.status,
    createdAt: bid.createdAt.toISOString(),
  };
}

function serializeGroupBuy(
  groupBuy: GroupBuyWithLocation,
  committedLbs: number,
  location = groupBuy.pickupLocation,
) {
  return {
    id: groupBuy.id,
    produceType: groupBuy.produceType,
    targetLbs: numeric(groupBuy.targetLbs),
    committedLbs,
    remainingLbs: Math.max(numeric(groupBuy.targetLbs) - committedLbs, 0),
    status: groupBuy.status,
    pickupLocation: location,
    pickupWindowStart: groupBuy.pickupWindowStart.toISOString(),
    pickupWindowEnd: groupBuy.pickupWindowEnd.toISOString(),
    joinDeadline: groupBuy.joinDeadline.toISOString(),
    bidDeadline: groupBuy.bidDeadline.toISOString(),
    selectedBidId: groupBuy.selectedBidId,
    createdBy: groupBuy.createdBy,
    createdAt: groupBuy.createdAt.toISOString(),
    updatedAt: groupBuy.updatedAt.toISOString(),
  };
}

async function committedQuantity(db: PrismaClient, groupBuyId: string) {
  const participants = await db.groupBuyParticipant.findMany({
    where: { groupBuyId },
    select: { requestedLbs: true },
  });
  return participants.reduce((total, participant) => total + numeric(participant.requestedLbs), 0);
}

export function createApp(db: PrismaClient): FastifyInstance {
  const app = Fastify({ logger: true });

  async function currentUser(request: FastifyRequest, reply: FastifyReply): Promise<User | null> {
    const userId = request.headers["x-user-id"];
    if (typeof userId !== "string" || userId.length === 0) {
      sendError(reply, 401, "UNAUTHENTICATED", "x-user-id is required for this MVP API");
      return null;
    }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      sendError(reply, 401, "UNAUTHENTICATED", "User was not found");
      return null;
    }
    return user;
  }

  async function requireRole(request: FastifyRequest, reply: FastifyReply, role: string) {
    const user = await currentUser(request, reply);
    if (!user) return null;
    if (user.role !== role) {
      sendError(reply, 403, "FORBIDDEN", `${role} role is required`);
      return null;
    }
    return user;
  }

  app.get("/health", async () => ({ data: { status: "ok" } }));

  app.get<{ Querystring: { produceType?: string; locationId?: string } }>(
    "/group-buys",
    async (request) => {
      const rows = await db.groupBuy.findMany({
        where: {
          ...(request.query.produceType ? { produceType: request.query.produceType } : {}),
          ...(request.query.locationId ? { pickupLocationId: request.query.locationId } : {}),
          status: { in: ["open", "funding", "matched", "ready_for_pickup"] },
        },
        include: { pickupLocation: true },
        orderBy: { pickupWindowStart: "asc" },
      });
      return {
        data: await Promise.all(rows.map(async (groupBuy) =>
          serializeGroupBuy(groupBuy, await committedQuantity(db, groupBuy.id)))),
      };
    },
  );

  app.post("/group-buys", async (request, reply) => {
    const user = await requireRole(request, reply, "customer");
    if (!user) return;
    const parsed = createGroupBuySchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", parsed.error.message);
    const values = {
      ...parsed.data,
      pickupWindowStart: parseDate(parsed.data.pickupWindowStart),
      pickupWindowEnd: parseDate(parsed.data.pickupWindowEnd),
      joinDeadline: parseDate(parsed.data.joinDeadline),
      bidDeadline: parseDate(parsed.data.bidDeadline),
    };
    if (!assertChronology(values)) {
      return sendError(reply, 400, "INVALID_SCHEDULE", "Deadlines must precede pickup and the pickup window must be ordered");
    }
    const location = await db.pickupLocation.findFirst({
      where: { id: values.pickupLocationId, active: true },
    });
    if (!location) return sendError(reply, 400, "INVALID_PICKUP_LOCATION", "Pickup location is not approved");
    const groupBuy = await db.groupBuy.create({
      data: {
        produceType: values.produceType,
        targetLbs: fixed(values.targetLbs),
        pickupLocationId: values.pickupLocationId,
        pickupWindowStart: values.pickupWindowStart,
        pickupWindowEnd: values.pickupWindowEnd,
        joinDeadline: values.joinDeadline,
        bidDeadline: values.bidDeadline,
        createdBy: user.id,
      },
      include: { pickupLocation: true },
    });
    await db.event.create({
      data: { groupBuyId: groupBuy.id, actorUserId: user.id, eventType: "group_buy_created", payload: JSON.stringify({ status: "open" }) },
    });
    return reply.code(201).send({ data: serializeGroupBuy(groupBuy, 0, location) });
  });

  app.get<{ Params: { id: string } }>("/group-buys/:id", async (request, reply) => {
    const groupBuy = await db.groupBuy.findUnique({
      where: { id: request.params.id },
      include: {
        pickupLocation: true,
        participants: true,
        bids: { orderBy: { pricePerLb: "asc" } },
        events: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!groupBuy) return sendError(reply, 404, "NOT_FOUND", "Group buy not found");
    return {
      data: {
        ...serializeGroupBuy(groupBuy, await committedQuantity(db, groupBuy.id)),
        participants: groupBuy.participants.map((participant) => ({
          ...participant,
          requestedLbs: numeric(participant.requestedLbs),
          depositAmount: numeric(participant.depositAmount),
        })),
        bids: groupBuy.bids.map(serializeBid),
        events: groupBuy.events.map((event) => ({ ...event, payload: JSON.parse(event.payload) })),
      },
    };
  });

  app.post<{ Params: { id: string } }>("/group-buys/:id/participants", async (request, reply) => {
    const user = await requireRole(request, reply, "customer");
    if (!user) return;
    const parsed = participantSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", parsed.error.message);
    const groupBuy = await db.groupBuy.findUnique({ where: { id: request.params.id } });
    if (!groupBuy) return sendError(reply, 404, "NOT_FOUND", "Group buy not found");
    if (!["open", "funding"].includes(groupBuy.status) || new Date() > groupBuy.joinDeadline) {
      return sendError(reply, 409, "JOIN_CLOSED", "This group buy is no longer accepting participants");
    }
    const existing = await db.groupBuyParticipant.findUnique({
      where: { groupBuyId_userId: { groupBuyId: groupBuy.id, userId: user.id } },
    });
    if (existing) return sendError(reply, 409, "ALREADY_JOINED", "Customer already joined this group buy");
    if (groupBuy.selectedBidId) {
      const selectedBid = await db.bid.findUnique({ where: { id: groupBuy.selectedBidId } });
      if (!selectedBid || await committedQuantity(db, groupBuy.id) + parsed.data.requestedLbs > numeric(selectedBid.availableLbs)) {
        return sendError(reply, 409, "QUANTITY_UNAVAILABLE", "Requested quantity exceeds the selected bid");
      }
    }
    const depositAmount = Number(process.env.DEPOSIT_AMOUNT_USD ?? "10");
    const participant = await db.$transaction(async (tx) => {
      const created = await tx.groupBuyParticipant.create({
        data: {
          groupBuyId: groupBuy.id,
          userId: user.id,
          requestedLbs: fixed(parsed.data.requestedLbs),
          depositAmount: fixed(depositAmount),
        },
      });
      if (groupBuy.status === "open") {
        await tx.groupBuy.update({ where: { id: groupBuy.id }, data: { status: "funding" } });
      }
      await tx.event.create({
        data: {
          groupBuyId: groupBuy.id,
          actorUserId: user.id,
          eventType: "participant_joined",
          payload: JSON.stringify({ requestedLbs: parsed.data.requestedLbs, depositStatus: "pending" }),
        },
      });
      return created;
    });
    return reply.code(201).send({ data: { ...participant, requestedLbs: numeric(participant.requestedLbs), depositAmount } });
  });

  app.post<{ Params: { id: string } }>("/group-buys/:id/bids", async (request, reply) => {
    const user = await requireRole(request, reply, "producer");
    if (!user) return;
    const parsed = bidSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", parsed.error.message);
    const groupBuy = await db.groupBuy.findUnique({ where: { id: request.params.id } });
    if (!groupBuy) return sendError(reply, 404, "NOT_FOUND", "Group buy not found");
    const values = {
      ...parsed.data,
      availabilityWindowStart: parseDate(parsed.data.availabilityWindowStart),
      availabilityWindowEnd: parseDate(parsed.data.availabilityWindowEnd),
    };
    if (!["open", "funding"].includes(groupBuy.status) || new Date() > groupBuy.bidDeadline) {
      return sendError(reply, 409, "BIDDING_CLOSED", "This group buy is no longer accepting bids");
    }
    if (values.availabilityWindowStart > groupBuy.pickupWindowStart ||
        values.availabilityWindowEnd < groupBuy.pickupWindowEnd ||
        values.availabilityWindowStart >= values.availabilityWindowEnd) {
      return sendError(reply, 400, "INVALID_AVAILABILITY", "Producer availability must cover the pickup window");
    }
    const bid = await db.bid.create({
      data: {
        groupBuyId: groupBuy.id,
        producerId: user.id,
        pricePerLb: fixed(parsed.data.pricePerLb),
        availableLbs: fixed(parsed.data.availableLbs),
        availabilityWindowStart: values.availabilityWindowStart,
        availabilityWindowEnd: values.availabilityWindowEnd,
        notes: parsed.data.notes,
      },
    });
    await db.event.create({
      data: { groupBuyId: groupBuy.id, actorUserId: user.id, eventType: "bid_submitted", payload: JSON.stringify({ bidId: bid.id }) },
    });
    return reply.code(201).send({ data: serializeBid(bid) });
  });

  app.get<{ Params: { id: string } }>("/group-buys/:id/bids", async (request) => ({
    data: (await db.bid.findMany({ where: { groupBuyId: request.params.id }, orderBy: { pricePerLb: "asc" } }))
      .map(serializeBid),
  }));

  app.post<{ Params: { id: string } }>("/group-buys/:id/select-bid", async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return;
    const groupBuy = await db.groupBuy.findUnique({ where: { id: request.params.id } });
    if (!groupBuy) return sendError(reply, 404, "NOT_FOUND", "Group buy not found");
    if (groupBuy.createdBy !== user.id) return sendError(reply, 403, "FORBIDDEN", "Only the request owner can select a bid");
    if (groupBuy.status !== "funding" || new Date() > groupBuy.bidDeadline) return sendError(reply, 409, "MATCHING_CLOSED", "This group buy cannot be matched");
    if (groupBuy.selectedBidId) return sendError(reply, 409, "ALREADY_MATCHED", "A bid has already been selected");
    const body = z.object({ bidId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return sendError(reply, 400, "INVALID_REQUEST", body.error.message);
    const bid = await db.bid.findFirst({ where: { id: body.data.bidId, groupBuyId: groupBuy.id } });
    if (!bid) return sendError(reply, 404, "NOT_FOUND", "Bid not found");
    if (await committedQuantity(db, groupBuy.id) < numeric(groupBuy.targetLbs)) {
      return sendError(reply, 409, "THRESHOLD_NOT_MET", "The committed quantity has not reached the target");
    }
    await db.$transaction(async (tx) => {
      await tx.bid.updateMany({ where: { groupBuyId: groupBuy.id, status: "submitted" }, data: { status: "rejected" } });
      await tx.bid.update({ where: { id: bid.id }, data: { status: "selected" } });
      await tx.groupBuy.update({ where: { id: groupBuy.id }, data: { selectedBidId: bid.id, status: "matched" } });
      await tx.event.create({
        data: { groupBuyId: groupBuy.id, actorUserId: user.id, eventType: "bid_selected", payload: JSON.stringify({ bidId: bid.id, status: "matched" }) },
      });
    });
    return { data: { groupBuyId: groupBuy.id, selectedBidId: bid.id, status: "matched" } };
  });

  app.patch<{ Params: { id: string } }>("/group-buys/:id/status", async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return;
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", parsed.error.message);
    const groupBuy = await db.groupBuy.findUnique({ where: { id: request.params.id } });
    if (!groupBuy) return sendError(reply, 404, "NOT_FOUND", "Group buy not found");
    const requested = parsed.data.status;
    const canCancel = requested === "cancelled" && (user.role === "operator" || (user.id === groupBuy.createdBy && ["open", "funding"].includes(groupBuy.status)));
    const canReady = requested === "ready_for_pickup" && user.role === "producer" && groupBuy.status === "matched";
    if (!canCancel && !canReady) return sendError(reply, 403, "FORBIDDEN", "User cannot make this status change");
    await db.$transaction([
      db.groupBuy.update({ where: { id: groupBuy.id }, data: { status: requested } }),
      db.event.create({ data: { groupBuyId: groupBuy.id, actorUserId: user.id, eventType: `group_buy_${requested}`, payload: JSON.stringify({ from: groupBuy.status, to: requested }) } }),
    ]);
    return { data: { id: groupBuy.id, status: requested } };
  });

  app.post("/jobs/resolve-group-buys", async (request, reply) => {
    const user = await requireRole(request, reply, "operator");
    if (!user) return;
    const now = new Date();
    const candidates = await db.groupBuy.findMany({
      where: {
        OR: [
          { status: "open", joinDeadline: { lt: now } },
          { status: "funding", bidDeadline: { lt: now } },
        ],
      },
    });
    const resolvedGroupBuyIds: string[] = [];
    for (const groupBuy of candidates) {
      await db.$transaction([
        db.groupBuy.updateMany({
          where: { id: groupBuy.id, status: { in: ["open", "funding"] } },
          data: { status: "cancelled" },
        }),
        db.event.create({
          data: {
            groupBuyId: groupBuy.id,
            actorUserId: user.id,
            eventType: "group_buy_cancelled_by_resolver",
            payload: JSON.stringify({ reason: "deadline_expired", resolvedAt: now.toISOString() }),
          },
        }),
      ]);
      resolvedGroupBuyIds.push(groupBuy.id);
    }
    return { data: { resolvedGroupBuyIds, resolvedAt: now.toISOString() } };
  });

  return app;
}
