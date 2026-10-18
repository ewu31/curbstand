import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD, seedCatalog, seedDemoUsers } from "./seed-data";

const prisma = new PrismaClient();
const DEMO_GROUP_BUY_ID = "demo-tomato-pickup";

async function seedBaselines() {
  for (const baseline of [
    { produceType: "apples", baselinePerLb: "0.35" },
    { produceType: "carrots", baselinePerLb: "0.25" },
    { produceType: "kale", baselinePerLb: "0.40" },
    { produceType: "tomatoes", baselinePerLb: "0.55" },
  ]) {
    await prisma.distributionCenterBaseline.upsert({
      where: { produceType_region: { produceType: baseline.produceType, region: "seattle-puget-sound" } },
      update: { baselinePerLb: baseline.baselinePerLb },
      create: { ...baseline, region: "seattle-puget-sound", updatedAt: new Date() },
    });
  }
}

async function seedReadyTomatoPickup() {
  const existing = await prisma.groupBuy.findUnique({ where: { id: DEMO_GROUP_BUY_ID } });
  if (existing) return;

  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@demo.curbstand.app" } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { email: "bob@demo.curbstand.app" } });
  const kitchen = await prisma.user.findUniqueOrThrow({ where: { email: "kitchen@demo.curbstand.app" } });
  const sam = await prisma.user.findUniqueOrThrow({ where: { email: "farmer.sam@demo.curbstand.app" } });
  const pickupWindowStart = new Date("2026-11-07T18:00:00.000Z");
  const pickupWindowEnd = new Date("2026-11-07T20:00:00.000Z");
  const bidId = "demo-tomato-bid";

  await prisma.groupBuy.create({
    data: {
      id: DEMO_GROUP_BUY_ID,
      produceTypeId: "tomatoes",
      targetLbsX100: 5000,
      pickupLocationId: "ballard-commons",
      pickupWindowStart,
      pickupWindowEnd,
      joinDeadline: new Date("2026-11-06T00:00:00.000Z"),
      bidDeadline: new Date("2026-11-06T12:00:00.000Z"),
      status: "ready_for_pickup",
      createdById: alice.id,
    },
  });
  await prisma.bid.create({
    data: {
      id: bidId,
      groupBuyId: DEMO_GROUP_BUY_ID,
      producerId: sam.id,
      priceCentsPerLb: 110,
      availableLbsX100: 5000,
      availabilityWindowStart: pickupWindowStart,
      availabilityWindowEnd: pickupWindowEnd,
      status: "selected",
    },
  });
  await prisma.groupBuy.update({ where: { id: DEMO_GROUP_BUY_ID }, data: { selectedBidId: bidId } });
  await prisma.groupBuyParticipant.createMany({
    data: [
      { id: "demo-tomato-bob", groupBuyId: DEMO_GROUP_BUY_ID, userId: bob.id, requestedLbsX100: 2000, depositAmountCents: 500, depositStatus: "pending", checkInToken: randomUUID() },
      { id: "demo-tomato-kitchen", groupBuyId: DEMO_GROUP_BUY_ID, userId: kitchen.id, requestedLbsX100: 3000, depositAmountCents: 500, depositStatus: "pending", checkInToken: randomUUID() },
    ],
  });
  await prisma.event.createMany({
    data: [
      { groupBuyId: DEMO_GROUP_BUY_ID, actorUserId: bob.id, eventType: "participant.joined", payload: JSON.stringify({ participantId: "demo-tomato-bob", requestedLbs: "20.00", depositStatus: "pending" }) },
      { groupBuyId: DEMO_GROUP_BUY_ID, actorUserId: kitchen.id, eventType: "participant.joined", payload: JSON.stringify({ participantId: "demo-tomato-kitchen", requestedLbs: "30.00", depositStatus: "pending" }) },
    ],
  });
}

try {
  await seedCatalog(prisma);
  await seedDemoUsers(prisma);
  await seedBaselines();
  await seedReadyTomatoPickup();
  console.log(`Seeded catalog, pickup locations, demo users (password: ${DEMO_PASSWORD}), and a ready tomato pickup.`);
} finally {
  await prisma.$disconnect();
}
