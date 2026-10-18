import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@curbstand/db";
import { schema } from "@curbstand/db";

const roleSchema = z.enum(["customer", "producer", "operator"]);
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

type AuthUser = typeof schema.users.$inferSelect;

function error(c: any, status: 400 | 401 | 403 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

function parseDate(value: string) {
  return new Date(value);
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

function decimal(value: string | number) {
  return Number(value);
}

async function committedQuantity(db: Database, groupBuyId: string) {
  const [result] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.groupBuyParticipants.requestedLbs}), 0)` })
    .from(schema.groupBuyParticipants)
    .where(eq(schema.groupBuyParticipants.groupBuyId, groupBuyId));
  return decimal(result?.total ?? "0");
}

function serializeGroupBuy(groupBuy: typeof schema.groupBuys.$inferSelect, committedLbs: number, location?: typeof schema.pickupLocations.$inferSelect) {
  return {
    id: groupBuy.id,
    produceType: groupBuy.produceType,
    targetLbs: decimal(groupBuy.targetLbs),
    committedLbs,
    remainingLbs: Math.max(decimal(groupBuy.targetLbs) - committedLbs, 0),
    status: groupBuy.status,
    pickupLocation: location ?? null,
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

export function createApp(db: Database) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ data: { status: "ok" } }));

  async function currentUser(c: any): Promise<AuthUser | Response> {
    const userId = c.req.header("x-user-id");
    if (!userId) return error(c, 401, "UNAUTHENTICATED", "x-user-id is required for this MVP API");
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) return error(c, 401, "UNAUTHENTICATED", "User was not found");
    return user;
  }

  async function requireRole(c: any, role: z.infer<typeof roleSchema>) {
    const user = await currentUser(c);
    if (user instanceof Response) return user;
    if (user.role !== role) return error(c, 403, "FORBIDDEN", `${role} role is required`);
    return user;
  }

  app.get("/group-buys", async (c) => {
    const produceType = c.req.query("produceType");
    const locationId = c.req.query("locationId");
    const filters = [inProgressGroupBuyFilter()];
    if (produceType) filters.push(eq(schema.groupBuys.produceType, produceType));
    if (locationId) filters.push(eq(schema.groupBuys.pickupLocationId, locationId));
    const rows = await db
      .select({ groupBuy: schema.groupBuys, location: schema.pickupLocations })
      .from(schema.groupBuys)
      .innerJoin(schema.pickupLocations, eq(schema.groupBuys.pickupLocationId, schema.pickupLocations.id))
      .where(and(...filters))
      .orderBy(asc(schema.groupBuys.pickupWindowStart));
    const data = await Promise.all(rows.map(async ({ groupBuy, location }) =>
      serializeGroupBuy(groupBuy, await committedQuantity(db, groupBuy.id), location)));
    return c.json({ data });
  });

  app.post("/group-buys", async (c) => {
    const user = await requireRole(c, "customer");
    if (user instanceof Response) return user;
    const parsed = createGroupBuySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return error(c, 400, "INVALID_REQUEST", parsed.error.message);
    const values = {
      ...parsed.data,
      pickupWindowStart: parseDate(parsed.data.pickupWindowStart),
      pickupWindowEnd: parseDate(parsed.data.pickupWindowEnd),
      joinDeadline: parseDate(parsed.data.joinDeadline),
      bidDeadline: parseDate(parsed.data.bidDeadline),
    };
    if (!assertChronology(values)) {
      return error(c, 400, "INVALID_SCHEDULE", "Deadlines must precede pickup and the pickup window must be ordered");
    }
    const [location] = await db.select().from(schema.pickupLocations)
      .where(and(eq(schema.pickupLocations.id, values.pickupLocationId), eq(schema.pickupLocations.active, true)));
    if (!location) return error(c, 400, "INVALID_PICKUP_LOCATION", "Pickup location is not approved");
    const [groupBuy] = await db.insert(schema.groupBuys).values({
      ...values,
      targetLbs: values.targetLbs.toFixed(2),
      createdBy: user.id,
    }).returning();
    await db.insert(schema.events).values({
      groupBuyId: groupBuy.id,
      actorUserId: user.id,
      eventType: "group_buy_created",
      payload: { status: "open" },
    });
    return c.json({ data: serializeGroupBuy(groupBuy, 0, location) }, 201);
  });

  app.get("/group-buys/:id", async (c) => {
    const [row] = await db.select({ groupBuy: schema.groupBuys, location: schema.pickupLocations })
      .from(schema.groupBuys)
      .innerJoin(schema.pickupLocations, eq(schema.groupBuys.pickupLocationId, schema.pickupLocations.id))
      .where(eq(schema.groupBuys.id, c.req.param("id")));
    if (!row) return error(c, 404, "NOT_FOUND", "Group buy not found");
    const [participants, bids, eventRows] = await Promise.all([
      db.select().from(schema.groupBuyParticipants).where(eq(schema.groupBuyParticipants.groupBuyId, row.groupBuy.id)),
      db.select().from(schema.bids).where(eq(schema.bids.groupBuyId, row.groupBuy.id)).orderBy(asc(schema.bids.pricePerLb)),
      db.select().from(schema.events).where(eq(schema.events.groupBuyId, row.groupBuy.id)).orderBy(desc(schema.events.createdAt)),
    ]);
    return c.json({
      data: {
        ...serializeGroupBuy(row.groupBuy, await committedQuantity(db, row.groupBuy.id), row.location),
        participants: participants.map((participant) => ({
          ...participant,
          requestedLbs: decimal(participant.requestedLbs),
          depositAmount: decimal(participant.depositAmount),
        })),
        bids: bids.map(serializeBid),
        events: eventRows,
      },
    });
  });

  app.post("/group-buys/:id/participants", async (c) => {
    const user = await requireRole(c, "customer");
    if (user instanceof Response) return user;
    const parsed = participantSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return error(c, 400, "INVALID_REQUEST", parsed.error.message);
    const [groupBuy] = await db.select().from(schema.groupBuys).where(eq(schema.groupBuys.id, c.req.param("id")));
    if (!groupBuy) return error(c, 404, "NOT_FOUND", "Group buy not found");
    const now = new Date();
    if (!["open", "funding"].includes(groupBuy.status) || now > groupBuy.joinDeadline) {
      return error(c, 409, "JOIN_CLOSED", "This group buy is no longer accepting participants");
    }
    const [existing] = await db.select().from(schema.groupBuyParticipants).where(and(
      eq(schema.groupBuyParticipants.groupBuyId, groupBuy.id),
      eq(schema.groupBuyParticipants.userId, user.id),
    ));
    if (existing) return error(c, 409, "ALREADY_JOINED", "Customer already joined this group buy");
    if (groupBuy.selectedBidId) {
      const [selectedBid] = await db.select().from(schema.bids).where(eq(schema.bids.id, groupBuy.selectedBidId));
      if (!selectedBid || (await committedQuantity(db, groupBuy.id)) + parsed.data.requestedLbs > decimal(selectedBid.availableLbs)) {
        return error(c, 409, "QUANTITY_UNAVAILABLE", "Requested quantity exceeds the selected bid");
      }
    }
    const depositAmount = Number(process.env.DEPOSIT_AMOUNT_USD ?? "10");
    const [participant] = await db.insert(schema.groupBuyParticipants).values({
      groupBuyId: groupBuy.id,
      userId: user.id,
      requestedLbs: parsed.data.requestedLbs.toFixed(2),
      depositAmount: depositAmount.toFixed(2),
    }).returning();
    if (groupBuy.status === "open") {
      await db.update(schema.groupBuys).set({ status: "funding", updatedAt: now }).where(eq(schema.groupBuys.id, groupBuy.id));
    }
    await db.insert(schema.events).values({
      groupBuyId: groupBuy.id,
      actorUserId: user.id,
      eventType: "participant_joined",
      payload: { requestedLbs: parsed.data.requestedLbs, depositStatus: "pending" },
    });
    return c.json({ data: { ...participant, requestedLbs: decimal(participant.requestedLbs), depositAmount } }, 201);
  });

  app.post("/group-buys/:id/bids", async (c) => {
    const user = await requireRole(c, "producer");
    if (user instanceof Response) return user;
    const parsed = bidSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return error(c, 400, "INVALID_REQUEST", parsed.error.message);
    const [groupBuy] = await db.select().from(schema.groupBuys).where(eq(schema.groupBuys.id, c.req.param("id")));
    if (!groupBuy) return error(c, 404, "NOT_FOUND", "Group buy not found");
    const values = {
      ...parsed.data,
      availabilityWindowStart: parseDate(parsed.data.availabilityWindowStart),
      availabilityWindowEnd: parseDate(parsed.data.availabilityWindowEnd),
    };
    if (!["open", "funding"].includes(groupBuy.status) || new Date() > groupBuy.bidDeadline) {
      return error(c, 409, "BIDDING_CLOSED", "This group buy is no longer accepting bids");
    }
    if (values.availabilityWindowStart > groupBuy.pickupWindowStart ||
        values.availabilityWindowEnd < groupBuy.pickupWindowEnd ||
        values.availabilityWindowStart >= values.availabilityWindowEnd) {
      return error(c, 400, "INVALID_AVAILABILITY", "Producer availability must cover the pickup window");
    }
    const [bid] = await db.insert(schema.bids).values({
      groupBuyId: groupBuy.id,
      producerId: user.id,
      pricePerLb: parsed.data.pricePerLb.toFixed(2),
      availableLbs: parsed.data.availableLbs.toFixed(2),
      availabilityWindowStart: values.availabilityWindowStart,
      availabilityWindowEnd: values.availabilityWindowEnd,
      notes: parsed.data.notes,
    }).returning();
    await db.insert(schema.events).values({
      groupBuyId: groupBuy.id,
      actorUserId: user.id,
      eventType: "bid_submitted",
      payload: { bidId: bid.id },
    });
    return c.json({ data: serializeBid(bid) }, 201);
  });

  app.get("/group-buys/:id/bids", async (c) => {
    const bids = await db.select().from(schema.bids)
      .where(eq(schema.bids.groupBuyId, c.req.param("id")))
      .orderBy(asc(schema.bids.pricePerLb));
    return c.json({ data: bids.map(serializeBid) });
  });

  app.post("/group-buys/:id/select-bid", async (c) => {
    const user = await currentUser(c);
    if (user instanceof Response) return user;
    const [groupBuy] = await db.select().from(schema.groupBuys).where(eq(schema.groupBuys.id, c.req.param("id")));
    if (!groupBuy) return error(c, 404, "NOT_FOUND", "Group buy not found");
    if (groupBuy.createdBy !== user.id) return error(c, 403, "FORBIDDEN", "Only the request owner can select a bid");
    if (groupBuy.status !== "funding" || new Date() > groupBuy.bidDeadline) return error(c, 409, "MATCHING_CLOSED", "This group buy cannot be matched");
    if (groupBuy.selectedBidId) return error(c, 409, "ALREADY_MATCHED", "A bid has already been selected");
    const body = await c.req.json().catch(() => null) as { bidId?: unknown } | null;
    const bidId = typeof body?.bidId === "string" ? body.bidId : "";
    const [bid] = await db.select().from(schema.bids).where(and(eq(schema.bids.id, bidId), eq(schema.bids.groupBuyId, groupBuy.id)));
    if (!bid) return error(c, 404, "NOT_FOUND", "Bid not found");
    if (await committedQuantity(db, groupBuy.id) < decimal(groupBuy.targetLbs)) {
      return error(c, 409, "THRESHOLD_NOT_MET", "The committed quantity has not reached the target");
    }
    await db.transaction(async (tx) => {
      await tx.update(schema.bids).set({ status: "rejected" }).where(and(
        eq(schema.bids.groupBuyId, groupBuy.id),
        eq(schema.bids.status, "submitted"),
      ));
      await tx.update(schema.bids).set({ status: "selected" }).where(eq(schema.bids.id, bid.id));
      await tx.update(schema.groupBuys).set({ selectedBidId: bid.id, status: "matched", updatedAt: new Date() }).where(eq(schema.groupBuys.id, groupBuy.id));
      await tx.insert(schema.events).values({
        groupBuyId: groupBuy.id,
        actorUserId: user.id,
        eventType: "bid_selected",
        payload: { bidId: bid.id, status: "matched" },
      });
    });
    return c.json({ data: { groupBuyId: groupBuy.id, selectedBidId: bid.id, status: "matched" } });
  });

  app.patch("/group-buys/:id/status", async (c) => {
    const user = await currentUser(c);
    if (user instanceof Response) return user;
    const parsed = statusSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return error(c, 400, "INVALID_REQUEST", parsed.error.message);
    const [groupBuy] = await db.select().from(schema.groupBuys).where(eq(schema.groupBuys.id, c.req.param("id")));
    if (!groupBuy) return error(c, 404, "NOT_FOUND", "Group buy not found");
    const requested = parsed.data.status;
    const canCancel = requested === "cancelled" && (user.role === "operator" || (user.id === groupBuy.createdBy && ["open", "funding"].includes(groupBuy.status)));
    const canReady = requested === "ready_for_pickup" && user.role === "producer" && groupBuy.status === "matched";
    if (!canCancel && !canReady) return error(c, 403, "FORBIDDEN", "User cannot make this status change");
    await db.update(schema.groupBuys).set({ status: requested, updatedAt: new Date() }).where(eq(schema.groupBuys.id, groupBuy.id));
    await db.insert(schema.events).values({
      groupBuyId: groupBuy.id,
      actorUserId: user.id,
      eventType: `group_buy_${requested}`,
      payload: { from: groupBuy.status, to: requested },
    });
    return c.json({ data: { id: groupBuy.id, status: requested } });
  });

  app.post("/jobs/resolve-group-buys", async (c) => {
    const user = await requireRole(c, "operator");
    if (user instanceof Response) return user;
    const now = new Date();
    const candidates = await db.select().from(schema.groupBuys).where(or(
      and(eq(schema.groupBuys.status, "open"), lt(schema.groupBuys.joinDeadline, now)),
      and(eq(schema.groupBuys.status, "funding"), lt(schema.groupBuys.bidDeadline, now)),
    ));
    const resolved: string[] = [];
    for (const groupBuy of candidates) {
      const committed = await committedQuantity(db, groupBuy.id);
      await db.update(schema.groupBuys).set({ status: "cancelled", updatedAt: now }).where(and(
        eq(schema.groupBuys.id, groupBuy.id),
        or(eq(schema.groupBuys.status, "open"), eq(schema.groupBuys.status, "funding")),
      ));
      await db.insert(schema.events).values({
        groupBuyId: groupBuy.id,
        actorUserId: user.id,
        eventType: "group_buy_cancelled_by_resolver",
        payload: { reason: "deadline_expired", committedLbs: committed },
      });
      resolved.push(groupBuy.id);
    }
    return c.json({ data: { resolvedGroupBuyIds: resolved, resolvedAt: now.toISOString() } });
  });

  return app;
}

function inProgressGroupBuyFilter() {
  return or(
    eq(schema.groupBuys.status, "open"),
    eq(schema.groupBuys.status, "funding"),
    eq(schema.groupBuys.status, "matched"),
    eq(schema.groupBuys.status, "ready_for_pickup"),
  )!;
}

function serializeBid(bid: typeof schema.bids.$inferSelect) {
  return {
    id: bid.id,
    groupBuyId: bid.groupBuyId,
    producerId: bid.producerId,
    pricePerLb: decimal(bid.pricePerLb),
    availableLbs: decimal(bid.availableLbs),
    availabilityWindowStart: bid.availabilityWindowStart.toISOString(),
    availabilityWindowEnd: bid.availabilityWindowEnd.toISOString(),
    notes: bid.notes,
    status: bid.status,
    createdAt: bid.createdAt.toISOString(),
  };
}
