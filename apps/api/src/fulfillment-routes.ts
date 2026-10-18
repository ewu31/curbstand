import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@curbstand/db";
import { createGeminiEstimator } from "../../../packages/fulfillment/src/benchmark/gemini.ts";
import { demoSampleEstimate } from "../../../packages/fulfillment/src/benchmark/sample.ts";
import { createFulfillmentApi } from "../../../packages/fulfillment/src/api.ts";
import { issueCheckInToken } from "../../../packages/fulfillment/src/checkin.ts";
import { refundConfirmedDepositsOnCancel } from "../../../packages/fulfillment/src/deposits.ts";
import type { Actor } from "../../../packages/fulfillment/src/types.ts";
import { PrismaFulfillmentRepository, PrismaTokenStore } from "./fulfillment-store.js";

export function createFulfillmentServices(db: PrismaClient) {
  const repo = new PrismaFulfillmentRepository(db);
  const tokens = new PrismaTokenStore(db);
  const gemini = process.env.GEMINI_API_KEY
    ? createGeminiEstimator({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      })
    : null;
  const handle = createFulfillmentApi({
    repo,
    tokens,
    now: () => new Date(),
    priceComparisonEnabled: () => process.env.PRICE_COMPARISON_ENABLED !== "false",
    estimateMode: () => (process.env.GEMINI_API_KEY ? "gemini" : "demo_sample"),
    estimate: (input) => (gemini ? gemini(input) : demoSampleEstimate(input)),
  });
  return { repo, tokens, handle };
}

export type FulfillmentServices = ReturnType<typeof createFulfillmentServices>;

export function registerFulfillmentRoutes(
  app: FastifyInstance,
  services: FulfillmentServices,
  actorFrom: (request: FastifyRequest, reply: FastifyReply) => Promise<Actor | null>,
) {
  const paths = [
    { method: "PATCH" as const, url: "/group-buys/:id/participants/:participantId/deposit" },
    { method: "GET" as const, url: "/group-buys/:id/participants/:participantId/check-in-token" },
    { method: "POST" as const, url: "/group-buys/:id/check-in" },
    { method: "POST" as const, url: "/group-buys/:id/complete" },
    { method: "POST" as const, url: "/group-buys/:id/cancel" },
    { method: "GET" as const, url: "/price-benchmarks" },
  ];
  for (const route of paths) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (request, reply) => {
        const actor = await actorFrom(request, reply);
        if (!actor) return;
        const url = new URL(request.url, "http://localhost");
        const result = await services.handle({
          method: request.method,
          path: url.pathname,
          query: url.searchParams,
          body: request.body ?? null,
          actor,
        });
        return reply.code(result.status).send(result.body);
      },
    });
  }
}

export async function refundDepositsForCancel(services: FulfillmentServices, actor: Actor, groupBuyId: string) {
  return refundConfirmedDepositsOnCancel(services.repo, actor, groupBuyId, new Date());
}

export async function issueReadyCheckInTokens(services: FulfillmentServices, groupBuyId: string, ownerUserId: string) {
  const participants = await services.repo.listParticipants(groupBuyId);
  for (const participant of participants) {
    if (participant.checkInTokenHash) continue;
    await issueCheckInToken(services.repo, services.tokens, { userId: ownerUserId, role: "customer" }, participant.id, new Date());
  }
}
