import type { SignupInput } from "@curbstand/shared";
import type { FastifyInstance } from "fastify";
import { buildApp, type AppOptions } from "../src/app";
import { prisma } from "../src/lib/db";
import { seedCatalog } from "../prisma/seed-data";

export { prisma };

let seeded = false;

/** Builds the app against the test DB with the catalog seeded. Close it in afterAll. */
export async function createTestApp(options: AppOptions = {}): Promise<FastifyInstance> {
  if (!seeded) {
    await seedCatalog(prisma);
    seeded = true;
  }
  const app = await buildApp(options);
  await app.ready();
  return app;
}

let counter = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}.${Date.now()}.${counter++}@test.local`;

export function customerSignup(overrides: Partial<Extract<SignupInput, { role: "customer" }>> = {}) {
  return {
    role: "customer" as const,
    email: uniqueEmail("customer"),
    password: "correct-horse",
    name: "Test Customer",
    orgType: "individual" as const,
    ...overrides,
  };
}

export function producerSignup(overrides: Partial<Extract<SignupInput, { role: "producer" }>> = {}) {
  return {
    role: "producer" as const,
    email: uniqueEmail("producer"),
    password: "correct-horse",
    name: "Test Producer",
    farmName: "Test Farm",
    produceTypes: ["apples", "pears"],
    serviceRadiusMiles: 50,
    farmLatitude: 47.6,
    farmLongitude: -122.3,
    ...overrides,
  };
}

/** Signs up a user and returns `{ token, user, auth }` where `auth` is ready-to-use headers. */
export async function signup(app: FastifyInstance, payload: SignupInput) {
  const res = await app.inject({ method: "POST", url: "/auth/signup", payload });
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { ...body, auth: { authorization: `Bearer ${body.token}` } };
}
