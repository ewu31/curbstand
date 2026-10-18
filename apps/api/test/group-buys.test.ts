import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, customerSignup, prisma, producerSignup, signup } from "./helpers";

type Actor = Awaited<ReturnType<typeof signup>>;

let app: FastifyInstance;
let owner: Actor, joiner: Actor, farmer: Actor, otherFarmer: Actor, operator: Actor;

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function groupBuyPayload(overrides: Record<string, unknown> = {}) {
  return {
    produceType: "apples",
    targetLbs: "50",
    pickupLocationId: "ballard-commons",
    joinDeadline: hoursFromNow(24),
    bidDeadline: hoursFromNow(48),
    pickupWindowStart: hoursFromNow(72),
    pickupWindowEnd: hoursFromNow(74),
    ...overrides,
  };
}

const bidPayload = (overrides: Record<string, unknown> = {}) => ({
  pricePerLbUsd: "1.85",
  availableLbs: "100",
  availabilityWindowStart: hoursFromNow(70),
  availabilityWindowEnd: hoursFromNow(80),
  ...overrides,
});

const call = (method: "GET" | "POST" | "PATCH", url: string, who?: Actor, payload?: object) =>
  app.inject({ method, url, headers: who?.auth ?? {}, payload });

async function createGroupBuy(overrides: Record<string, unknown> = {}) {
  const res = await call("POST", "/group-buys", owner, groupBuyPayload(overrides));
  expect(res.statusCode, res.body).toBe(201);
  return res.json().groupBuy as { id: string; status: string };
}

/** open -> funding with `lbs` committed by `joiner`, plus a bid from `farmer`. */
async function fundedWithBid(lbs = "50") {
  const gb = await createGroupBuy();
  expect((await call("POST", `/group-buys/${gb.id}/participants`, joiner, { requestedLbs: lbs })).statusCode).toBe(201);
  const bid = (await call("POST", `/group-buys/${gb.id}/bids`, farmer, bidPayload())).json().bid;
  return { gb, bid };
}

beforeAll(async () => {
  app = await createTestApp();
  owner = await signup(app, customerSignup({ name: "Owner" }));
  joiner = await signup(app, customerSignup({ name: "Joiner" }));
  farmer = await signup(app, producerSignup({ farmName: "Selected Farm" }));
  otherFarmer = await signup(app, producerSignup({ farmName: "Other Farm" }));
  operator = await signup(app, customerSignup({ name: "Op" }));
  await prisma.user.update({ where: { id: operator.user.id }, data: { isOperator: true } });
});
afterAll(async () => {
  await app.close();
});

describe("create and browse", () => {
  it("creates an open group buy with an event", async () => {
    const res = await call("POST", "/group-buys", owner, groupBuyPayload());
    expect(res.statusCode).toBe(201);
    const { groupBuy } = res.json();
    expect(groupBuy).toMatchObject({
      status: "open",
      targetLbs: "50.00",
      committedLbs: "0.00",
      remainingLbs: "50.00",
      createdById: owner.user.id,
      myParticipation: null,
      selectedBid: null,
    });
    expect(groupBuy.events.map((e: { eventType: string }) => e.eventType)).toEqual(["group_buy.created"]);
  });

  it("requires a customer", async () => {
    expect((await call("POST", "/group-buys", undefined, groupBuyPayload())).statusCode).toBe(401);
    expect((await call("POST", "/group-buys", farmer, groupBuyPayload())).statusCode).toBe(403);
  });

  it("rejects unapproved locations and bad schedules", async () => {
    const res = await call("POST", "/group-buys", owner, groupBuyPayload({ pickupLocationId: "my-house" }));
    expect(res.statusCode).toBe(400);
    const sched = await call("POST", "/group-buys", owner, groupBuyPayload({ bidDeadline: hoursFromNow(12) }));
    expect(sched.statusCode).toBe(400);
  });

  it("filters by produce type and location", async () => {
    const kale = await createGroupBuy({ produceType: "kale", pickupLocationId: "northgate-station" });
    const byType = (await call("GET", "/group-buys?produceType=kale")).json().groupBuys;
    expect(byType.map((g: { id: string }) => g.id)).toContain(kale.id);
    expect(byType.every((g: { produceType: { id: string } }) => g.produceType.id === "kale")).toBe(true);
    const byLoc = (await call("GET", "/group-buys?locationId=northgate-station")).json().groupBuys;
    expect(byLoc.every((g: { pickupLocation: { id: string } }) => g.pickupLocation.id === "northgate-station")).toBe(true);
    expect((await call("GET", "/group-buys?produceType=durian")).statusCode).toBe(400);
  });

  it("detail requires authentication", async () => {
    const gb = await createGroupBuy();
    expect((await call("GET", `/group-buys/${gb.id}`)).statusCode).toBe(401);
    expect((await call("GET", "/group-buys/nope", owner)).statusCode).toBe(404);
  });
});

describe("participation", () => {
  it("first join moves open -> funding and records a pending deposit intent", async () => {
    const gb = await createGroupBuy();
    const res = await call("POST", `/group-buys/${gb.id}/participants`, joiner, { requestedLbs: "20.5" });
    expect(res.statusCode).toBe(201);
    expect(res.json().participant).toMatchObject({ requestedLbs: "20.50", depositAmountUsd: "5.00", depositStatus: "pending" });

    const detail = (await call("GET", `/group-buys/${gb.id}`, joiner)).json().groupBuy;
    expect(detail).toMatchObject({ status: "funding", committedLbs: "20.50", remainingLbs: "29.50" });
    expect(detail.myParticipation.requestedLbs).toBe("20.50");
    expect(detail.depositSummary.countsByStatus.pending).toBe(1);
  });

  it("rejects duplicate joins, producers, and non-positive quantities", async () => {
    const gb = await createGroupBuy();
    await call("POST", `/group-buys/${gb.id}/participants`, joiner, { requestedLbs: "5" });
    const dup = await call("POST", `/group-buys/${gb.id}/participants`, joiner, { requestedLbs: "5" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("ALREADY_JOINED");
    expect((await call("POST", `/group-buys/${gb.id}/participants`, farmer, { requestedLbs: "5" })).statusCode).toBe(403);
    expect((await call("POST", `/group-buys/${gb.id}/participants`, owner, { requestedLbs: "0" })).statusCode).toBe(400);
  });

  it("rejects joins after the join deadline", async () => {
    const gb = await createGroupBuy();
    await prisma.groupBuy.update({ where: { id: gb.id }, data: { joinDeadline: new Date(Date.now() - 1000) } });
    const res = await call("POST", `/group-buys/${gb.id}/participants`, joiner, { requestedLbs: "5" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("DEADLINE_PASSED");
  });
});

describe("bidding and matching", () => {
  it("producer bids on an open/funding group buy; customers cannot bid", async () => {
    const gb = await createGroupBuy();
    const res = await call("POST", `/group-buys/${gb.id}/bids`, farmer, bidPayload());
    expect(res.statusCode).toBe(201);
    expect(res.json().bid).toMatchObject({ pricePerLbUsd: "1.85", availableLbs: "100.00", status: "submitted", producerFarmName: "Selected Farm" });
    expect((await call("POST", `/group-buys/${gb.id}/bids`, owner, bidPayload())).statusCode).toBe(403);
  });

  it("rejects producers who don't grow the produce type or are out of range", async () => {
    const kale = await createGroupBuy({ produceType: "kale" });
    const wrongType = await call("POST", `/group-buys/${kale.id}/bids`, farmer, bidPayload());
    expect(wrongType.statusCode).toBe(403);
    expect(wrongType.json().error).toMatchObject({ code: "NOT_ELIGIBLE", details: { reasons: ["produce_type"] } });

    // Spokane farm, 50 mi radius, Seattle pickup (~230 mi)
    const far = await signup(app, producerSignup({ farmLatitude: 47.6588, farmLongitude: -117.426 }));
    const gb = await createGroupBuy();
    const res = await call("POST", `/group-buys/${gb.id}/bids`, far, bidPayload());
    expect(res.statusCode).toBe(403);
    expect(res.json().error.details.reasons).toEqual(["service_radius"]);
  });

  it("requires availability to cover the pickup window", async () => {
    const gb = await createGroupBuy();
    const res = await call("POST", `/group-buys/${gb.id}/bids`, farmer, bidPayload({ availabilityWindowStart: hoursFromNow(73) }));
    expect(res.statusCode).toBe(400);
  });

  it("lists bids sorted by price", async () => {
    const gb = await createGroupBuy();
    await call("POST", `/group-buys/${gb.id}/bids`, farmer, bidPayload({ pricePerLbUsd: "2.10" }));
    await call("POST", `/group-buys/${gb.id}/bids`, otherFarmer, bidPayload({ pricePerLbUsd: "1.60" }));
    const prices = (await call("GET", `/group-buys/${gb.id}/bids`)).json().bids.map((b: { pricePerLbUsd: string }) => b.pricePerLbUsd);
    expect(prices).toEqual(["1.60", "2.10"]);
  });

  it("owner cannot select before the threshold is met", async () => {
    const { gb, bid } = await fundedWithBid("10");
    const res = await call("POST", `/group-buys/${gb.id}/select-bid`, owner, { bidId: bid.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: "THRESHOLD_NOT_MET", details: { committedLbs: "10.00", targetLbs: "50.00" } });
  });

  it("only the owner can select", async () => {
    const { gb, bid } = await fundedWithBid();
    expect((await call("POST", `/group-buys/${gb.id}/select-bid`, joiner, { bidId: bid.id })).statusCode).toBe(403);
  });

  it("selecting moves to matched exactly once and marks other bids not_selected", async () => {
    const { gb, bid } = await fundedWithBid();
    const other = (await call("POST", `/group-buys/${gb.id}/bids`, otherFarmer, bidPayload())).json().bid;

    const res = await call("POST", `/group-buys/${gb.id}/select-bid`, owner, { bidId: bid.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().groupBuy).toMatchObject({ status: "matched", selectedBidId: bid.id, selectedBid: { status: "selected" } });

    const again = await call("POST", `/group-buys/${gb.id}/select-bid`, owner, { bidId: other.id });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("ALREADY_MATCHED");

    const statuses = (await call("GET", `/group-buys/${gb.id}/bids`)).json().bids.map((b: { id: string; status: string }) => [b.id, b.status]);
    expect(Object.fromEntries(statuses)).toEqual({ [bid.id]: "selected", [other.id]: "not_selected" });
  });
});

describe("status changes", () => {
  it("only the selected producer can mark ready_for_pickup", async () => {
    const { gb, bid } = await fundedWithBid();
    await call("POST", `/group-buys/${gb.id}/select-bid`, owner, { bidId: bid.id });
    expect((await call("PATCH", `/group-buys/${gb.id}/status`, otherFarmer, { status: "ready_for_pickup" })).statusCode).toBe(403);
    const res = await call("PATCH", `/group-buys/${gb.id}/status`, farmer, { status: "ready_for_pickup" });
    expect(res.statusCode).toBe(200);
    expect(res.json().groupBuy.status).toBe("ready_for_pickup");
  });

  it("owner can cancel while open/funding but not after matched; operator can", async () => {
    const open = await createGroupBuy();
    const res = await call("PATCH", `/group-buys/${open.id}/status`, owner, { status: "cancelled", reason: "changed plans" });
    expect(res.json().groupBuy.status).toBe("cancelled");
    expect(res.json().groupBuy.events.at(-1)).toMatchObject({ eventType: "group_buy.cancelled", payload: { from: "open", to: "cancelled", reason: "changed plans" } });

    const { gb, bid } = await fundedWithBid();
    await call("POST", `/group-buys/${gb.id}/select-bid`, owner, { bidId: bid.id });
    expect((await call("PATCH", `/group-buys/${gb.id}/status`, owner, { status: "cancelled" })).statusCode).toBe(403);
    expect((await call("PATCH", `/group-buys/${gb.id}/status`, operator, { status: "cancelled" })).statusCode).toBe(200);
  });

  it("invalid transitions return 409", async () => {
    const gb = await createGroupBuy();
    await call("PATCH", `/group-buys/${gb.id}/status`, operator, { status: "cancelled" });
    const res = await call("PATCH", `/group-buys/${gb.id}/status`, operator, { status: "cancelled" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INVALID_TRANSITION");
  });
});

describe("POST /jobs/resolve-group-buys", () => {
  it("cancels expired group buys idempotently and is operator-only", async () => {
    const gb = await createGroupBuy();
    await prisma.groupBuy.update({ where: { id: gb.id }, data: { joinDeadline: new Date(Date.now() - 1000) } });
    expect((await call("POST", "/jobs/resolve-group-buys", owner)).statusCode).toBe(403);

    const first = (await call("POST", "/jobs/resolve-group-buys", operator)).json();
    expect(first.resolvedGroupBuyIds).toContain(gb.id);
    const second = (await call("POST", "/jobs/resolve-group-buys", operator)).json();
    expect(second.resolvedGroupBuyIds).not.toContain(gb.id);

    const detail = (await call("GET", `/group-buys/${gb.id}`, owner)).json().groupBuy;
    expect(detail.status).toBe("cancelled");
    expect(detail.events.filter((e: { eventType: string }) => e.eventType === "group_buy.cancelled")).toHaveLength(1);
  });
});
