import {
  canTransitionGroupBuy,
  createGroupBuySchema,
  hundredthsToLbs,
  joinGroupBuySchema,
  listGroupBuysQuerySchema,
  updateGroupBuyStatusSchema,
  type GroupBuyResponse,
  type GroupBuyStatus,
  type ListGroupBuysResponse,
  type ParticipantResponse,
} from "@curbstand/shared";
import type { FastifyPluginAsync } from "fastify";
import { authUser, requireAuth, requireCustomer, requireOperator, requireProducer } from "../auth/guards";
import { issueReadyCheckInTokens, refundDepositsForCancel, toFulfillmentActor } from "../fulfillment";
import { ensurePickupTexts } from "../pickup-text";
import { config } from "../config";
import { prisma } from "../lib/db";
import { badRequest, conflict, deadlinePassed, forbidden, HttpError, invalidTransition, notFound } from "../lib/errors";
import { recordEvent } from "../lib/events";
import {
  committedLbsX100,
  groupBuyDetailInclude,
  groupBuySummaryInclude,
  participantInclude,
  toGroupBuyDetail,
  toGroupBuySummary,
  toParticipant,
} from "../lib/serializers";

type IdParams = { Params: { id: string } };

const IN_PROGRESS: GroupBuyStatus[] = ["open", "funding", "matched", "ready_for_pickup"];
const ACCEPTING: GroupBuyStatus[] = ["open", "funding"];

async function loadDetail(id: string, viewerId: string): Promise<GroupBuyResponse> {
  const row = await prisma.groupBuy.findUnique({ where: { id }, include: groupBuyDetailInclude });
  if (!row) throw notFound("Group buy not found");
  return { groupBuy: toGroupBuyDetail(row, viewerId, config.depositAmountCents) };
}

async function committedFor(groupBuyId: string) {
  return committedLbsX100(
    await prisma.groupBuyParticipant.findMany({ where: { groupBuyId }, select: { requestedLbsX100: true } }),
  );
}

const routes: FastifyPluginAsync = async (app) => {
  /** Public browse. Defaults to in-progress group buys; `status` narrows to one status. */
  app.get("/group-buys", async (request): Promise<ListGroupBuysResponse> => {
    const query = listGroupBuysQuerySchema.parse(request.query);
    const rows = await prisma.groupBuy.findMany({
      where: {
        produceTypeId: query.produceType,
        pickupLocationId: query.locationId,
        status: query.status ?? { in: IN_PROGRESS },
      },
      include: groupBuySummaryInclude,
      orderBy: { pickupWindowStart: "asc" },
    });
    return { groupBuys: rows.map(toGroupBuySummary) };
  });

  app.post("/group-buys", { preHandler: requireProducer }, async (request, reply): Promise<GroupBuyResponse> => {
    const user = authUser(request);
    const input = createGroupBuySchema.parse(request.body);
    if (input.joinDeadline <= new Date()) throw badRequest("Commitment deadline must be in the future");
    const groupBuy = await prisma.$transaction(async (tx) => {
      const created = await tx.groupBuy.create({
        data: {
          produceTypeId: input.produceType,
          targetLbsX100: input.targetLbs,
          priceCentsPerLb: input.pricePerLbUsd,
          pickupLocationId: input.pickupLocationId,
          pickupWindowStart: input.pickupWindowStart,
          pickupWindowEnd: input.pickupWindowEnd,
          joinDeadline: input.joinDeadline,
          bidDeadline: input.joinDeadline,
          createdById: user.id,
        },
      });
      await recordEvent(tx, {
        groupBuyId: created.id,
        actorUserId: user.id,
        eventType: "group_buy.created",
        payload: { status: "open" },
      });
      return created;
    });
    reply.status(201);
    return loadDetail(groupBuy.id, user.id);
  });

  app.get<IdParams>("/group-buys/:id", { preHandler: requireAuth }, async (request) =>
    loadDetail(request.params.id, authUser(request).id),
  );

  app.post<IdParams>(
    "/group-buys/:id/participants",
    { preHandler: requireCustomer },
    async (request, reply): Promise<ParticipantResponse> => {
      const user = authUser(request);
      const { requestedLbs } = joinGroupBuySchema.parse(request.body);
      const groupBuy = await prisma.groupBuy.findUnique({
        where: { id: request.params.id },
        include: { selectedBid: true },
      });
      if (!groupBuy) throw notFound("Group buy not found");
      if (!ACCEPTING.includes(groupBuy.status as GroupBuyStatus)) {
        throw new HttpError("GROUP_BUY_CLOSED", "This group buy is no longer accepting participants", {
          status: groupBuy.status,
        });
      }
      if (groupBuy.priceCentsPerLb == null) throw conflict("This legacy request has no fixed seller price and cannot accept commitments");
      if (new Date() > groupBuy.joinDeadline) throw deadlinePassed("join", groupBuy.joinDeadline);

      const existing = await prisma.groupBuyParticipant.findUnique({
        where: { groupBuyId_userId: { groupBuyId: groupBuy.id, userId: user.id } },
      });
      if (existing) throw new HttpError("ALREADY_JOINED", "You already joined this group buy");

      if (groupBuy.selectedBid) {
        const committed = await committedFor(groupBuy.id);
        if (committed + requestedLbs > groupBuy.selectedBid.availableLbsX100) {
          throw new HttpError("QUANTITY_UNAVAILABLE", "Requested quantity exceeds the selected bid", {
            remainingAvailableLbs: hundredthsToLbs(Math.max(groupBuy.selectedBid.availableLbsX100 - committed, 0)),
          });
        }
      }

      const participant = await prisma.$transaction(async (tx) => {
        const created = await tx.groupBuyParticipant.create({
          data: {
            groupBuyId: groupBuy.id,
            userId: user.id,
            requestedLbsX100: requestedLbs,
            depositAmountCents: config.depositAmountCents,
          },
          include: participantInclude,
        });
        const committed = committedLbsX100(await tx.groupBuyParticipant.findMany({ where: { groupBuyId: groupBuy.id }, select: { requestedLbsX100: true } }));
        const status = committed >= groupBuy.targetLbsX100 ? "matched" : "funding";
        const changed = await tx.groupBuy.updateMany({ where: { id: groupBuy.id, status: { in: ACCEPTING }, joinDeadline: { gt: new Date() } }, data: { status } });
        if (!changed.count) throw conflict("This drop has closed; refresh and retry");
        if (status !== groupBuy.status) await recordEvent(tx, {
          groupBuyId: groupBuy.id, actorUserId: user.id, eventType: "group_buy.status_changed",
          payload: { from: groupBuy.status, to: status, pickupWindowStart: groupBuy.pickupWindowStart.toISOString() },
        });
        await recordEvent(tx, {
          groupBuyId: groupBuy.id,
          actorUserId: user.id,
          eventType: "participant.joined",
          payload: { participantId: created.id, requestedLbs: hundredthsToLbs(requestedLbs), depositStatus: "pending" },
        });
        return created;
      });
      reply.status(201);
      return { participant: toParticipant(participant) };
    },
  );

  /**
   * Manual transitions:
   *  - cancelled: the owner while open/funding, or an operator from any cancellable status
   *  - ready_for_pickup: the seller who published the drop, while matched
   */
  app.patch<IdParams>("/group-buys/:id/status", { preHandler: requireAuth }, async (request) => {
    const user = authUser(request);
    const { status: to, reason } = updateGroupBuyStatusSchema.parse(request.body);
    const groupBuy = await prisma.groupBuy.findUnique({
      where: { id: request.params.id },
      include: { selectedBid: { select: { producerId: true } } },
    });
    if (!groupBuy) throw notFound("Group buy not found");
    const from = groupBuy.status as GroupBuyStatus;

    const allowed =
      to === "cancelled"
        ? user.isOperator || (user.id === groupBuy.createdById && ACCEPTING.includes(from))
        : user.role === "producer" && user.id === groupBuy.createdById;
    if (!allowed) throw forbidden("You cannot make this status change");
    if (!canTransitionGroupBuy(from, to)) throw invalidTransition(from, to);
    if (to === "cancelled") await refundDepositsForCancel(toFulfillmentActor(user), groupBuy.id);

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.groupBuy.updateMany({ where: { id: groupBuy.id, status: from }, data: { status: to } });
      if (count === 0) throw conflict("The group buy changed while processing; refresh and retry");
      await recordEvent(tx, {
        groupBuyId: groupBuy.id,
        actorUserId: user.id,
        eventType: to === "cancelled" ? "group_buy.cancelled" : "group_buy.status_changed",
        payload: { from, to, ...(reason ? { reason } : {}) },
      });
    });
    if (to === "ready_for_pickup") {
      await issueReadyCheckInTokens(groupBuy.id, groupBuy.createdById);
      await ensurePickupTexts(groupBuy.id, user.id);
    }
    return loadDetail(groupBuy.id, user.id);
  });

  /**
   * Scheduler hook: cancels open group buys past their join deadline and funding group
   * buys past their commitment deadline. Idempotent — only still-eligible rows are changed.
   */
  app.post("/jobs/resolve-group-buys", { preHandler: requireOperator }, async (request) => {
    const user = authUser(request);
    const now = new Date();
    const candidates = await prisma.groupBuy.findMany({
      where: {
        OR: [
          { status: "open", joinDeadline: { lt: now } },
          { status: "funding", joinDeadline: { lt: now } },
        ],
      },
      select: { id: true, status: true },
    });
    const resolvedGroupBuyIds: string[] = [];
    for (const candidate of candidates) {
      const resolved = await prisma.$transaction(async (tx) => {
        const { count } = await tx.groupBuy.updateMany({
          where: { id: candidate.id, status: candidate.status },
          data: { status: "cancelled" },
        });
        if (count === 0) return false;
        await recordEvent(tx, {
          groupBuyId: candidate.id,
          actorUserId: user.id,
          eventType: "group_buy.cancelled",
          payload: { from: candidate.status, to: "cancelled", reason: "deadline_expired" },
        });
        return true;
      });
      if (resolved) resolvedGroupBuyIds.push(candidate.id);
    }
    return { resolvedGroupBuyIds, resolvedAt: now.toISOString() };
  });
};

export default routes;
