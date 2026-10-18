import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./index.js";

for (const produce of [
  { slug: "apples", displayName: "Apples" },
  { slug: "carrots", displayName: "Carrots" },
  { slug: "tomatoes", displayName: "Tomatoes" },
  { slug: "leafy-greens", displayName: "Leafy greens" },
]) {
  const existing = await prisma.produceCatalog.findUnique({ where: { slug: produce.slug } });
  if (!existing) await prisma.produceCatalog.create({ data: produce });
}

for (const location of [
  { name: "UW District public pickup", address: "University District, Seattle" },
  { name: "Ballard public pickup", address: "Ballard, Seattle" },
  { name: "Bellevue public pickup", address: "Downtown Bellevue" },
]) {
  const existing = await prisma.pickupLocation.findFirst({ where: { name: location.name } });
  if (!existing) await prisma.pickupLocation.create({ data: location });
}

const users = [
  { id: "11111111-1111-4111-8111-111111111111", role: "customer", name: "Alice Chen", email: "alice@curbstand.dev" },
  { id: "22222222-2222-4222-8222-222222222222", role: "customer", name: "Bob Alvarez", email: "bob@curbstand.dev" },
  { id: "33333333-3333-4333-8333-333333333333", role: "customer", name: "Cara Singh", email: "cara@curbstand.dev" },
  { id: "44444444-4444-4444-8444-444444444444", role: "producer", name: "Dana Ortiz", email: "dana@curbstand.dev" },
  { id: "55555555-5555-4555-8555-555555555555", role: "customer", name: "Erin Brooks", email: "erin@curbstand.dev" },
  { id: "66666666-6666-4666-8666-666666666666", role: "operator", name: "Pickup operator", email: "operator@curbstand.dev" },
] as const;

for (const user of users) {
  await prisma.user.upsert({
    where: { email: user.email },
    update: { name: user.name, role: user.role },
    create: { ...user, passwordHash: "dev-header-auth-only" },
  });
}

await prisma.producerProfile.upsert({
  where: { userId: users[3].id },
  update: {},
  create: { userId: users[3].id, farmName: "Ortiz Farm", produceTypes: "tomatoes,carrots,apples", serviceRadiusMiles: 40 },
});

for (const baseline of [
  { produceType: "apples", baselinePerLb: "0.35" },
  { produceType: "carrots", baselinePerLb: "0.25" },
  { produceType: "leafy-greens", baselinePerLb: "0.40" },
  { produceType: "tomatoes", baselinePerLb: "0.55" },
]) {
  await prisma.distributionCenterBaseline.upsert({
    where: { produceType_region: { produceType: baseline.produceType, region: "seattle-puget-sound" } },
    update: { baselinePerLb: baseline.baselinePerLb },
    create: { ...baseline, region: "seattle-puget-sound", updatedAt: new Date() },
  });
}

const location = await prisma.pickupLocation.findFirst({ where: { name: "Ballard public pickup" } });
const groupBuyId = "77777777-7777-4777-8777-777777777777";
const bidId = "88888888-8888-4888-8888-888888888888";
if (location && !(await prisma.groupBuy.findUnique({ where: { id: groupBuyId } }))) {
  const pickupWindowStart = new Date("2026-10-24T18:00:00.000Z");
  const pickupWindowEnd = new Date("2026-10-24T20:00:00.000Z");
  await prisma.groupBuy.create({
    data: {
      id: groupBuyId,
      produceType: "tomatoes",
      targetLbs: "50.00",
      pickupLocationId: location.id,
      pickupWindowStart,
      pickupWindowEnd,
      joinDeadline: new Date("2026-10-23T00:00:00.000Z"),
      bidDeadline: new Date("2026-10-23T12:00:00.000Z"),
      status: "ready_for_pickup",
      createdBy: users[0].id,
    },
  });
  await prisma.bid.create({
    data: {
      id: bidId,
      groupBuyId,
      producerId: users[3].id,
      pricePerLb: "1.10",
      availableLbs: "50.00",
      availabilityWindowStart: pickupWindowStart,
      availabilityWindowEnd: pickupWindowEnd,
      status: "selected",
    },
  });
  await prisma.groupBuy.update({ where: { id: groupBuyId }, data: { selectedBidId: bidId } });
  await prisma.groupBuyParticipant.createMany({
    data: [
      { id: "99999999-9999-4999-8999-999999999991", groupBuyId, userId: users[1].id, requestedLbs: "20.00", depositAmount: "5.00", depositStatus: "pending" },
      { id: "99999999-9999-4999-8999-999999999992", groupBuyId, userId: users[2].id, requestedLbs: "30.00", depositAmount: "5.00", depositStatus: "pending" },
    ],
  });
  await prisma.event.createMany({
    data: [
      { groupBuyId, actorUserId: users[1].id, eventType: "deposit_intent_recorded", payload: JSON.stringify({ participantId: "99999999-9999-4999-8999-999999999991", depositStatus: "pending", depositAmount: "5.00", currency: "USD" }) },
      { groupBuyId, actorUserId: users[2].id, eventType: "deposit_intent_recorded", payload: JSON.stringify({ participantId: "99999999-9999-4999-8999-999999999992", depositStatus: "pending", depositAmount: "5.00", currency: "USD" }) },
    ],
  });
}

for (const participantId of ["99999999-9999-4999-8999-999999999991", "99999999-9999-4999-8999-999999999992"]) {
  const participant = await prisma.groupBuyParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.checkInTokenHash) continue;
  const token = randomUUID();
  await prisma.groupBuyParticipant.update({
    where: { id: participantId },
    data: { checkInTokenHash: createHash("sha256").update(token).digest("hex") },
  });
  await prisma.checkInToken.create({ data: { participantId, token } });
}

await prisma.$disconnect();
