import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { assertOwner, authUser, requireCustomer, requireOperator, requireOwner, requireProducer } from "../src/auth/guards";
import { registerErrorHandling } from "../src/lib/errors";
import { createTestApp, customerSignup, prisma, producerSignup, signup } from "./helpers";

// A throwaway app exercising the guards the way other tasks will use them.
let app: FastifyInstance;
let realApp: FastifyInstance;
let customer: Awaited<ReturnType<typeof signup>>;
let otherCustomer: Awaited<ReturnType<typeof signup>>;
let producer: Awaited<ReturnType<typeof signup>>;
let operator: Awaited<ReturnType<typeof signup>>;

beforeAll(async () => {
  realApp = await createTestApp();
  customer = await signup(realApp, customerSignup());
  otherCustomer = await signup(realApp, customerSignup());
  producer = await signup(realApp, producerSignup());
  operator = await signup(realApp, customerSignup());
  await prisma.user.update({ where: { id: operator.user.id }, data: { isOperator: true } });

  app = Fastify();
  app.decorateRequest("authUser", null);
  registerErrorHandling(app);
  app.get("/customer-only", { preHandler: requireCustomer }, async (req) => ({ id: authUser(req).id }));
  app.get("/producer-only", { preHandler: requireProducer }, async () => ({ ok: true }));
  app.get("/operator-only", { preHandler: requireOperator }, async () => ({ ok: true }));
  const ownerFromParams = async (req: FastifyRequest) => {
    const { ownerId } = req.params as { ownerId: string };
    return ownerId === "missing" ? null : ownerId;
  };
  app.get("/owned/:ownerId", { preHandler: requireOwner(ownerFromParams, { allowOperator: true }) }, async () => ({
    ok: true,
  }));
  app.get<{ Params: { ownerId: string } }>("/assert/:ownerId", { preHandler: requireCustomer }, async (req) => {
    assertOwner(authUser(req), req.params.ownerId);
    return { ok: true };
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await realApp.close();
});

const get = (url: string, who?: { auth: Record<string, string> }) =>
  app.inject({ method: "GET", url, headers: who?.auth ?? {} });

describe("role guards", () => {
  it("401 when unauthenticated", async () => {
    for (const url of ["/customer-only", "/producer-only", "/operator-only", "/owned/x"]) {
      expect((await get(url)).statusCode).toBe(401);
    }
  });

  it("customer guard", async () => {
    expect((await get("/customer-only", customer)).statusCode).toBe(200);
    const res = await get("/customer-only", producer);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("producer guard", async () => {
    expect((await get("/producer-only", producer)).statusCode).toBe(200);
    expect((await get("/producer-only", customer)).statusCode).toBe(403);
  });

  it("operator guard", async () => {
    expect((await get("/operator-only", operator)).statusCode).toBe(200);
    expect((await get("/operator-only", customer)).statusCode).toBe(403);
  });
});

describe("ownership guards", () => {
  it("allows the owner, rejects others, and lets operators through when allowed", async () => {
    expect((await get(`/owned/${customer.user.id}`, customer)).statusCode).toBe(200);
    expect((await get(`/owned/${customer.user.id}`, otherCustomer)).statusCode).toBe(403);
    expect((await get(`/owned/${customer.user.id}`, operator)).statusCode).toBe(200);
  });

  it("404 when the resource does not exist", async () => {
    expect((await get("/owned/missing", customer)).statusCode).toBe(404);
  });

  it("assertOwner inside a handler", async () => {
    expect((await get(`/assert/${customer.user.id}`, customer)).statusCode).toBe(200);
    expect((await get(`/assert/${customer.user.id}`, otherCustomer)).statusCode).toBe(403);
    // operators are not implicitly owners
    expect((await get(`/assert/${customer.user.id}`, operator)).statusCode).toBe(403);
  });
});
