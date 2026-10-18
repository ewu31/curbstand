import { PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD, seedCatalog, seedDemoUsers } from "./seed-data";

const prisma = new PrismaClient();

try {
  await seedCatalog(prisma);
  await seedDemoUsers(prisma);
  console.log(`Seeded catalog, pickup locations, and demo users (password: ${DEMO_PASSWORD}).`);
} finally {
  await prisma.$disconnect();
}
