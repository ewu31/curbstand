import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Actor } from "../../../../packages/fulfillment/src/types";
import { authUser, requireAuth } from "../auth/guards";
import { fulfillmentServices, toFulfillmentActor } from "../fulfillment";

const routes: FastifyPluginAsync = async (app) => {
  const services = fulfillmentServices();

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
      preHandler: requireAuth,
      handler: async (request, reply) => {
        const actor = actorFrom(request);
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
};

function actorFrom(request: FastifyRequest): Actor {
  return toFulfillmentActor(authUser(request));
}

export default routes;
