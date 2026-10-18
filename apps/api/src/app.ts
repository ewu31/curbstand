import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Fastify, { type FastifyPluginAsync, type FastifyServerOptions } from "fastify";
import { config } from "./config";
import { registerErrorHandling } from "./lib/errors";

const routesDir = join(fileURLToPath(new URL(".", import.meta.url)), "routes");

/**
 * Every `src/routes/*.ts` file whose default export is a Fastify plugin is registered
 * automatically, so each task adds its own route file without editing this one.
 */
async function registerRoutes(app: ReturnType<typeof Fastify>) {
  const files = (await readdir(routesDir))
    .filter((f) => /\.(ts|js)$/.test(f) && !/\.(test|spec|d)\.(ts|js)$/.test(f))
    .sort();
  for (const file of files) {
    const mod = (await import(pathToFileURL(join(routesDir, file)).href)) as { default?: FastifyPluginAsync };
    if (typeof mod.default !== "function") throw new Error(`routes/${file} must default-export a Fastify plugin`);
    await app.register(mod.default);
  }
}

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    ...opts,
  });

  app.decorateRequest("authUser", null);

  // Minimal CORS for the frontend dev server (no credentials; bearer tokens only).
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    }
    if (request.method === "OPTIONS") return reply.status(204).send();
  });

  registerErrorHandling(app);
  await registerRoutes(app);
  return app;
}
