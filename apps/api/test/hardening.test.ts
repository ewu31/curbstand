import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, customerSignup } from "./helpers";

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp({ authRateLimit: { max: 3, timeWindowMs: 60_000 } });
});
afterAll(async () => {
  await app.close();
});

describe("auth rate limiting", () => {
  it("returns 429 RATE_LIMITED after too many login attempts from one IP", async () => {
    const attempt = () =>
      app.inject({ method: "POST", url: "/auth/login", payload: { email: "x@test.local", password: "wrong-pass" } });
    for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
    const res = await attempt();
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("does not throttle non-auth routes", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: "GET", url: "/produce-types" })).statusCode).toBe(200);
    }
  });
});

describe("body limit", () => {
  it("rejects oversized bodies with 413", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { ...customerSignup(), name: "x".repeat(100 * 1024) },
      remoteAddress: "10.0.0.2",
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
