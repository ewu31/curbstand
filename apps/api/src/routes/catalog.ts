import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/db";

// Public reference data for forms and filters.
const routes: FastifyPluginAsync = async (app) => {
  app.get("/produce-types", async () => ({
    produceTypes: await prisma.produceType.findMany({ orderBy: { name: "asc" } }),
  }));

  app.get("/pickup-locations", async () => ({
    pickupLocations: await prisma.pickupLocation.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }] }),
  }));
};

export default routes;
