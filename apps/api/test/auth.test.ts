import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, customerSignup, prisma, producerSignup, signup } from "./helpers";

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

describe("POST /auth/signup", () => {
  it("registers a customer and returns a token and profile", async () => {
    const payload = customerSignup({ orgType: "restaurant", phone: "206-555-0100" });
    const res = await app.inject({ method: "POST", url: "/auth/signup", payload });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.user).toMatchObject({
      role: "customer",
      isOperator: false,
      email: payload.email,
      orgType: "restaurant",
      phone: "206-555-0100",
      producerProfile: null,
    });
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("registers a producer with profile fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: producerSignup({ produceTypes: ["pears", "apples", "apples"] }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({
      role: "producer",
      orgType: null,
      producerProfile: { farmName: "Test Farm", produceTypes: ["apples", "pears"], serviceRadiusMiles: 50 },
    });
  });

  it("stores a hash, not the plaintext password", async () => {
    const payload = customerSignup();
    await signup(app, payload);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: payload.email } });
    expect(row.passwordHash).not.toContain(payload.password);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("normalizes email case and rejects duplicates with 409", async () => {
    const payload = customerSignup();
    await signup(app, payload);
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { ...payload, email: payload.email.toUpperCase() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects invalid input with 400 and field details", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { ...producerSignup(), produceTypes: ["durian"], password: "short" },
    });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    const paths = error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["password", "produceTypes.0"]));
  });

  it("rejects unknown roles", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { ...customerSignup(), role: "admin" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    const payload = customerSignup();
    await signup(app, payload);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: payload.email, password: payload.password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(payload.email);
  });

  it("returns 401 for a wrong password or unknown email", async () => {
    const payload = customerSignup();
    await signup(app, payload);
    for (const creds of [
      { email: payload.email, password: "wrong-password" },
      { email: "nobody@test.local", password: "whatever123" },
    ]) {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
    }
  });
});

describe("GET /me", () => {
  it("returns the current user's profile", async () => {
    const { auth, user } = await signup(app, producerSignup());
    const res = await app.inject({ method: "GET", url: "/me", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toEqual(user);
  });

  it("returns 401 without a token or with a bad token", async () => {
    for (const headers of [{}, { authorization: "Bearer not.a.jwt" }, { authorization: "Basic abc" }]) {
      const res = await app.inject({ method: "GET", url: "/me", headers });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
  });
});

describe("PATCH /me", () => {
  const patch = (auth: Record<string, string>, payload: unknown) =>
    app.inject({ method: "PATCH", url: "/me", headers: auth, payload: payload as object });

  it("updates customer fields and clears phone with null", async () => {
    const { auth } = await signup(app, customerSignup({ phone: "206-555-0100" }));
    const res = await patch(auth, { name: "New Name", orgType: "restaurant", phone: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ name: "New Name", orgType: "restaurant", phone: null });
    // persisted
    expect((await app.inject({ method: "GET", url: "/me", headers: auth })).json().user.name).toBe("New Name");
  });

  it("updates producer profile fields and replaces produce types", async () => {
    const { auth } = await signup(app, producerSignup({ produceTypes: ["apples", "pears"] }));
    const res = await patch(auth, { farmName: "Renamed Farm", produceTypes: ["kale"], serviceRadiusMiles: 25 });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.producerProfile).toMatchObject({
      farmName: "Renamed Farm",
      produceTypes: ["kale"],
      serviceRadiusMiles: 25,
      farmLatitude: 47.6,
    });
  });

  it("updates only the user name for a producer without touching the profile", async () => {
    const { auth, user } = await signup(app, producerSignup());
    const res = await patch(auth, { name: "Just A Name" });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.producerProfile).toEqual(user.producerProfile);
  });

  it("rejects fields from the other role, immutable fields, and empty bodies", async () => {
    const customer = await signup(app, customerSignup());
    const producer = await signup(app, producerSignup());
    for (const [auth, payload] of [
      [customer.auth, { farmName: "Nope" }],
      [producer.auth, { orgType: "restaurant" }],
      [customer.auth, { role: "producer" }],
      [customer.auth, { email: "new@test.local" }],
      [customer.auth, { password: "new-password" }],
      [customer.auth, {}],
      [producer.auth, { produceTypes: [] }],
    ] as const) {
      const res = await patch(auth, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 401 without a token", async () => {
    expect((await patch({}, { name: "x" })).statusCode).toBe(401);
  });
});
