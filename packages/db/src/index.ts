import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageDir = moduleDir.replace(/[\\/](?:dist|src)$/, "");

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:./")) {
  const databaseFile = resolve(packageDir, "prisma", "curbstand.db").replaceAll("\\", "/");
  process.env.DATABASE_URL = `file:${databaseFile}`;
}

export const prisma = new PrismaClient();
export { Prisma, PrismaClient } from "@prisma/client";
