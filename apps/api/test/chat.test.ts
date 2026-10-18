import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, customerSignup, prisma, producerSignup, signup } from "./helpers";

type Actor = Awaited<ReturnType<typeof signup>>;

let app: FastifyInstance;
let owner: Actor, joiner: Actor, farmer: Actor, stranger: Actor, operator: Actor;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const call = (method: "GET" | "POST" | "PATCH", url: string, who?: Actor, payload?: object) =>
  app.inject({ method, url, headers: who?.auth ?? {}, payload });

beforeAll(async () => {
  app = await createTestApp();
  owner = await signup(app, customerSignup({ name: "Owner", phone: "+12065550111" }));
  joiner = await signup(app, customerSignup({ name: "Joiner" }));
  farmer = await signup(app, producerSignup({ name: "Farmer", farmName: "Chat Farm" }));
  stranger = await signup(app, customerSignup({ name: "Stranger" }));
  operator = await signup(app, customerSignup({ name: "Op" }));
  await prisma.user.update({ where: { id: operator.user.id }, data: { isOperator: true } });
});

afterAll(async () => {
  await app.close();
});

const drop = {
  produceType: "apples",
  targetLbs: "50.00",
  pricePerLbUsd: "1.85",
  pickupLocationId: "ballard-commons",
  joinDeadline: hoursFromNow(24),
  pickupWindowStart: hoursFromNow(72),
  pickupWindowEnd: hoursFromNow(74),
};

async function matchedBuy() {
  const created = await call("POST", "/group-buys", farmer, drop);
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().groupBuy.id as string;
  expect((await call("POST", `/group-buys/${id}/participants`, owner, { requestedLbs: "20.00" })).statusCode).toBe(201);
  expect((await call("POST", `/group-buys/${id}/participants`, joiner, { requestedLbs: "30.00" })).statusCode).toBe(201);
  return id;
}

describe("website chat and pickup texts", () => {
  it("keeps the chat closed until a farmer is selected, then lets customers and that farmer talk", async () => {
    const created = await call("POST", "/group-buys", farmer, drop);
    const id = created.json().groupBuy.id as string;
    const closed = await call("POST", `/group-buys/${id}/messages`, farmer, { body: "Hello" });
    expect(closed.statusCode).toBe(409);

    const groupBuyId = await matchedBuy();
    expect((await call("GET", `/group-buys/${groupBuyId}/messages`)).statusCode).toBe(401);
    expect((await call("POST", `/group-buys/${groupBuyId}/messages`, stranger, { body: "Hello" })).statusCode).toBe(403);

    const fromJoiner = await call("POST", `/group-buys/${groupBuyId}/messages`, joiner, { body: "Can we pick up after 11?" });
    expect(fromJoiner.statusCode).toBe(201);
    const fromFarmer = await call("POST", `/group-buys/${groupBuyId}/messages`, farmer, { body: "Yes, I'll be there." });
    expect(fromFarmer.statusCode).toBe(201);

    const chat = (await call("GET", `/group-buys/${groupBuyId}/messages`, farmer)).json().chat;
    expect(chat.open).toBe(true);
    expect(chat.farmerName).toBe("Farmer");
    expect(chat.messages.map((message: { body: string }) => message.body)).toEqual([
      "Can we pick up after 11?",
      "Yes, I'll be there.",
    ]);
    expect((await call("GET", `/group-buys/${groupBuyId}/messages`, operator)).statusCode).toBe(200);
    expect((await call("POST", `/group-buys/${groupBuyId}/messages`, operator, { body: "No" })).statusCode).toBe(403);
  });

  it("records a Photon text for each customer when the farmer confirms pickup", async () => {
    const id = await matchedBuy();
    const ready = await call("PATCH", `/group-buys/${id}/status`, farmer, { status: "ready_for_pickup" });
    expect(ready.statusCode, ready.body).toBe(200);

    const texts = await prisma.pickupText.findMany({ where: { groupBuyId: id }, orderBy: { userId: "asc" } });
    expect(texts).toHaveLength(2);
    expect(texts.find((row) => row.userId === owner.user.id)?.status).toBe("not_configured");
    expect(texts.find((row) => row.userId === joiner.user.id)?.status).toBe("skipped_no_phone");
    expect(texts.some((row) => row.userId === farmer.user.id)).toBe(false);

    const farmerChat = (await call("GET", `/group-buys/${id}/messages`, farmer)).json().chat;
    const buyerChat = (await call("GET", `/group-buys/${id}/messages`, owner)).json().chat;
    expect(buyerChat.myText.status).toBe("not_configured");
    expect(farmerChat.textSummary).toEqual({ sent: 0, skippedNoPhone: 1, notConfigured: 1, failed: 0 });
    expect(await prisma.pickupText.count({ where: { groupBuyId: id } })).toBe(2);
    const events = ready.json().groupBuy.events as Array<{ eventType: string; payload: Record<string, unknown> }>;
    expect(events.at(-1)).toMatchObject({
      eventType: "pickup.text_notified",
      payload: { sent: 0, skippedNoPhone: 1, notConfigured: 1, failed: 0 },
    });
  });
});
