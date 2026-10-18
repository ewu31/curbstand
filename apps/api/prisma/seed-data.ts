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
    { email: "alice@demo.curbstand.app", name: "Alice Nguyen", orgType: "individual", phone: "+12065550101" },
    { email: "bob@demo.curbstand.app", name: "Bob Martinez", orgType: "individual", phone: "+12065550102" },
    { email: "kitchen@demo.curbstand.app", name: "Ballard Bistro", orgType: "restaurant", phone: "+12065550103" },
  ];
  for (const c of customers) {
    await prisma.user.upsert({
      where: { email: c.email },
      update: { photoUrl: c.photoUrl },
      create: { ...c, role: "customer", passwordHash },
    });
    await prisma.user.updateMany({ where: { email: c.email, phone: null }, data: { phone: c.phone } });
  }

  await prisma.user.upsert({
    where: { email: "operator@demo.curbstand.app" },
    update: { isOperator: true, photoUrl: "/avatars/operator.svg" },
    create: {
      email: "operator@demo.curbstand.app",
      name: "Curbstand Operator",
      role: "customer",
      orgType: "individual",
      isOperator: true,
      phone: "+12065550107",
      passwordHash,
    },
  });
  await prisma.user.updateMany({
    where: { email: "operator@demo.curbstand.app", phone: null },
    data: { phone: "+12065550107" },
  });

  const producers = [
    {
      email: "farmer.joe@demo.curbstand.app",
      name: "Joe Yamamoto",
      phone: "+12065550105",
      farmName: "Skagit Valley Growers",
      producerType: "local_farmer",
      serviceRadiusMiles: 80,
      farmLatitude: 48.4232,
      farmLongitude: -122.3343,
      produceTypes: ["potatoes", "onions", "carrots", "strawberries"],
    },
    {
      email: "farmer.maria@demo.curbstand.app",
      name: "Maria Lopez",
      phone: "+12065550106",
      farmName: "Yakima Orchard Co.",
      producerType: "large_scale_farmer",
      serviceRadiusMiles: 160,
      farmLatitude: 46.6021,
      farmLongitude: -120.5059,
      produceTypes: ["apples", "pears", "cherries"],
    },
    {
      email: "farmer.sam@demo.curbstand.app",
      name: "Sam Okafor",
      phone: "+12065550104",
      farmName: "Snoqualmie Greens",
      producerType: "at_home",
      serviceRadiusMiles: 40,
      farmLatitude: 47.6493,
      farmLongitude: -121.9087,
      produceTypes: ["lettuce", "kale", "tomatoes"],
    },
  ];
  for (const { produceTypes, farmName, producerType, serviceRadiusMiles, farmLatitude, farmLongitude, ...u } of producers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { photoUrl: u.photoUrl, producerProfile: { update: { producerType } } },
      create: {
        ...u,
        role: "producer",
        passwordHash,
        producerProfile: {
          create: {
            farmName,
            producerType,
            serviceRadiusMiles,
            farmLatitude,
            farmLongitude,
            produceTypes: { create: produceTypes.map((produceTypeId) => ({ produceTypeId })) },
          },
        },
      },
    });
    if (u.phone) {
      await prisma.user.updateMany({ where: { email: u.email, phone: null }, data: { phone: u.phone } });
    }
  }
}
