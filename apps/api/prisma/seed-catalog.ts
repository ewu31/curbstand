import { PrismaClient } from "@prisma/client";
import { seedCatalog } from "./seed-data";
const prisma = new PrismaClient();
try { await seedCatalog(prisma); } finally { await prisma.$disconnect(); }
