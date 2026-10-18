import { PICKUP_LOCATIONS, PRODUCE_TYPES } from "@curbstand/shared";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password";

export const DEMO_PASSWORD = "password123";

/** Idempotent: upserts the controlled produce catalog and approved pickup locations. */
export async function seedCatalog(prisma: PrismaClient) {
  for (const p of PRODUCE_TYPES) {
    await prisma.produceType.upsert({ where: { id: p.id }, update: p, create: p });
  }
  for (const l of PICKUP_LOCATIONS) {
    await prisma.pickupLocation.upsert({ where: { id: l.id }, update: l, create: l });
  }
}

/** Idempotent: demo accounts for both roles plus an operator. All use DEMO_PASSWORD. */
export async function seedDemoUsers(prisma: PrismaClient) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const customers = [
    { email: "alice@demo.curbstand.app", name: "Alice Nguyen", orgType: "individual" },
    { email: "bob@demo.curbstand.app", name: "Bob Martinez", orgType: "individual" },
    { email: "kitchen@demo.curbstand.app", name: "Ballard Bistro", orgType: "restaurant" },
  ];
  for (const c of customers) {
    await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: { ...c, role: "customer", passwordHash },
    });
  }

  await prisma.user.upsert({
    where: { email: "operator@demo.curbstand.app" },
    update: { isOperator: true },
    create: {
      email: "operator@demo.curbstand.app",
      name: "Curbstand Operator",
      role: "customer",
      orgType: "individual",
      isOperator: true,
      passwordHash,
    },
  });

  const producers = [
    {
      email: "farmer.joe@demo.curbstand.app",
      name: "Joe Yamamoto",
      farmName: "Skagit Valley Growers",
      serviceRadiusMiles: 80,
      farmLatitude: 48.4232,
      farmLongitude: -122.3343,
      produceTypes: ["potatoes", "onions", "carrots", "strawberries"],
    },
    {
      email: "farmer.maria@demo.curbstand.app",
      name: "Maria Lopez",
      farmName: "Yakima Orchard Co.",
      serviceRadiusMiles: 160,
      farmLatitude: 46.6021,
      farmLongitude: -120.5059,
      produceTypes: ["apples", "pears", "cherries"],
    },
    {
      email: "farmer.sam@demo.curbstand.app",
      name: "Sam Okafor",
      farmName: "Snoqualmie Greens",
      serviceRadiusMiles: 40,
      farmLatitude: 47.6493,
      farmLongitude: -121.9087,
      produceTypes: ["lettuce", "kale", "tomatoes"],
    },
  ];
  for (const { produceTypes, farmName, serviceRadiusMiles, farmLatitude, farmLongitude, ...u } of producers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        ...u,
        role: "producer",
        passwordHash,
        producerProfile: {
          create: {
            farmName,
            serviceRadiusMiles,
            farmLatitude,
            farmLongitude,
            produceTypes: { create: produceTypes.map((produceTypeId) => ({ produceTypeId })) },
          },
        },
      },
    });
  }
}
