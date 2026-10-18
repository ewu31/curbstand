import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { groupBuyDetailInclude, groupBuySummaryInclude, toGroupBuyDetail, toGroupBuySummary } from "../src/lib/serializers";
import { createTestApp, customerSignup, prisma, producerSignup, signup } from "./helpers";

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

describe("group-buy serializers", () => {
  it("serializes a full group buy with units, statuses, and viewer participation", async () => {
    const owner = await signup(app, customerSignup({ name: "Owner" }));
    const joiner = await signup(app, customerSignup({ name: "Joiner" }));
    const farmer = await signup(app, producerSignup({ farmName: "Serializer Farm" }));

    const gb = await prisma.groupBuy.create({
      data: {
        produceTypeId: "apples",
        targetLbsX100: 5000,
        pickupLocationId: "ballard-commons",
        pickupWindowStart: new Date("2026-10-24T17:00:00Z"),
        pickupWindowEnd: new Date("2026-10-24T19:00:00Z"),
        joinDeadline: new Date("2026-10-21T00:00:00Z"),
        bidDeadline: new Date("2026-10-22T00:00:00Z"),
        status: "matched",
        createdById: owner.user.id,
        participants: {
          create: [
            { userId: owner.user.id, requestedLbsX100: 3050, depositAmountCents: 500, depositStatus: "confirmed_manual" },
            { userId: joiner.user.id, requestedLbsX100: 2500, depositAmountCents: 500 },
          ],
        },
        events: { create: [{ eventType: "group_buy.created", actorUserId: owner.user.id, payload: '{"status":"open"}' }] },
      },
    });
    const bid = await prisma.bid.create({
      data: {
        groupBuyId: gb.id,
        producerId: farmer.user.id,
        priceCentsPerLb: 185,
        availableLbsX100: 10000,
        availabilityWindowStart: new Date("2026-10-24T16:00:00Z"),
        availabilityWindowEnd: new Date("2026-10-24T20:00:00Z"),
        status: "selected",
      },
    });
    await prisma.groupBuy.update({ where: { id: gb.id }, data: { selectedBidId: bid.id } });

    const summaryRow = await prisma.groupBuy.findUniqueOrThrow({ where: { id: gb.id }, include: groupBuySummaryInclude });
    expect(toGroupBuySummary(summaryRow)).toMatchObject({
      status: "matched",
      produceType: { id: "apples", name: "Apples" },
      pickupLocation: { id: "ballard-commons", city: "Seattle" },
      targetLbs: "50.00",
      committedLbs: "55.50",
      remainingLbs: "0.00",
      participantCount: 2,
      pickupWindowStart: "2026-10-24T17:00:00.000Z",
      selectedBidId: bid.id,
    });

    const detailRow = await prisma.groupBuy.findUniqueOrThrow({ where: { id: gb.id }, include: groupBuyDetailInclude });
    const detail = toGroupBuyDetail(detailRow, joiner.user.id, 500);
    expect(detail.selectedBid).toMatchObject({ pricePerLbUsd: "1.85", availableLbs: "100.00", producerFarmName: "Serializer Farm" });
    expect(detail.myParticipation).toMatchObject({ userName: "Joiner", requestedLbs: "25.00", depositStatus: "pending" });
    expect(detail.participants[0]).not.toHaveProperty("email");
    expect(detail.depositSummary).toEqual({
      simulated: true,
      amountPerParticipantUsd: "5.00",
      countsByStatus: { pending: 1, confirmed_manual: 1, refunded_manual: 0, forfeited_manual: 0 },
      totalsByStatusUsd: { pending: "5.00", confirmed_manual: "5.00", refunded_manual: "0.00", forfeited_manual: "0.00" },
    });
    expect(detail.events).toEqual([expect.objectContaining({ eventType: "group_buy.created", payload: { status: "open" } })]);
    expect(toGroupBuyDetail(detailRow, null, 500).myParticipation).toBeNull();
  });

  it("throws on an unknown status rather than passing it through", async () => {
    const owner = await signup(app, customerSignup());
    const gb = await prisma.groupBuy.create({
      data: {
        produceTypeId: "kale",
        targetLbsX100: 1000,
        pickupLocationId: "northgate-station",
        pickupWindowStart: new Date(),
        pickupWindowEnd: new Date(),
        joinDeadline: new Date(),
        bidDeadline: new Date(),
        status: "bogus",
        createdById: owner.user.id,
      },
      include: groupBuySummaryInclude,
    });
    expect(() => toGroupBuySummary(gb)).toThrow(/Unexpected group buy status/);
  });
});
