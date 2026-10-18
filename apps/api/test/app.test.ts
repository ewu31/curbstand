import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "./helpers";

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

describe("app", () => {
  it("GET /health checks the database", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("serves the seeded catalog", async () => {
    const produce = await app.inject({ method: "GET", url: "/produce-types" });
    expect(produce.json().produceTypes.length).toBeGreaterThan(5);
    const locations = await app.inject({ method: "GET", url: "/pickup-locations" });
    expect(locations.json().pickupLocations[0]).toMatchObject({ id: expect.any(String), city: expect.any(String) });
  });

  it("unknown routes use the shared error shape", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("malformed JSON returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{bad",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
