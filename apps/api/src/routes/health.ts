import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/db";

const routes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ok" };
    } catch {
      return reply.status(503).send({ status: "degraded", database: "unreachable" });
    }
  });
};

export default routes;
