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

await prisma.$disconnect();
