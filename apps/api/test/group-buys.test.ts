import { afterAll, beforeAll, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, customerSignup, prisma, producerSignup, signup } from "./helpers";
let app: FastifyInstance;
type Actor = Awaited<ReturnType<typeof signup>>;
let seller: Actor, buyer: Actor, other: Actor, otherSeller: Actor, operator: Actor;
const future = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
const payload = (extra = {}) => ({ produceType: "apples", targetLbs: "50.00", pricePerLbUsd: "1.85", pickupLocationId: "ballard-commons", joinDeadline: future(24), pickupWindowStart: future(48), pickupWindowEnd: future(50), ...extra });
const call = (method: "GET" | "POST" | "PATCH", url: string, actor?: Actor, payload?: object) => app.inject({ method, url, headers: actor?.auth, payload });
async function create(extra = {}) { const res = await call("POST", "/group-buys", seller, payload(extra)); expect(res.statusCode, res.body).toBe(201); return res.json().groupBuy; }
beforeAll(async () => { app = await createTestApp(); seller = await signup(app, producerSignup()); otherSeller = await signup(app, producerSignup()); buyer = await signup(app, customerSignup()); other = await signup(app, customerSignup()); operator = await signup(app, customerSignup()); await prisma.user.update({ where: { id: operator.user.id }, data: { isOperator: true } }); });
afterAll(async () => { await app.close(); });
it("only producers can publish a fixed-price drop", async () => {
 expect((await call("POST", "/group-buys", undefined, payload())).statusCode).toBe(401);
 expect((await call("POST", "/group-buys", buyer, payload())).statusCode).toBe(403);
 const drop = await create(); expect(drop).toMatchObject({ status: "open", pricePerLbUsd: "1.85", sellerName: "Test Farm", targetLbs: "50.00" });
 const list = (await call("GET", "/group-buys")).json().groupBuys; expect(list.find((r: { id: string }) => r.id === drop.id).pricePerLbUsd).toBe("1.85");
});
it("rejects missing or invalid prices and past or reversed dates", async () => {
 for (const extra of [{ pricePerLbUsd: undefined }, { pricePerLbUsd: "0" }, { pricePerLbUsd: "1.234" }, { joinDeadline: future(-1) }, { joinDeadline: future(49) }, { pickupWindowEnd: future(47) }]) expect((await call("POST", "/group-buys", seller, payload(extra))).statusCode).toBe(400);
});
it("confirms the scheduled date exactly when commitments reach the minimum", async () => {
 const drop = await create(); const url = `/group-buys/${drop.id}`;
 expect((await call("POST", `${url}/participants`, buyer, { requestedLbs: "20.25" })).statusCode).toBe(201);
 expect((await call("GET", url, seller)).json().groupBuy.status).toBe("funding");
 expect((await call("POST", `${url}/participants`, buyer, { requestedLbs: "1" })).statusCode).toBe(409);
 expect((await call("POST", `${url}/participants`, other, { requestedLbs: "29.75" })).statusCode).toBe(201);
 const confirmed = (await call("GET", url, buyer)).json().groupBuy;
 expect(confirmed).toMatchObject({ status: "matched", committedLbs: "50.00", pricePerLbUsd: "1.85", pickupWindowStart: drop.pickupWindowStart });
 expect(confirmed.selectedBidId).toEqual(expect.any(String));
 expect(confirmed.events.filter((e: { payload: { to?: string } }) => e.payload.to === "matched")).toHaveLength(1);
 expect((await call("POST", `${url}/participants`, operator, { requestedLbs: "1" })).statusCode).toBe(409);
 expect((await call("PATCH", `${url}/status`, otherSeller, { status: "ready_for_pickup" })).statusCode).toBe(403);
 expect((await call("PATCH", `${url}/status`, seller, { status: "ready_for_pickup" })).json().groupBuy.status).toBe("ready_for_pickup");
});
it("a commitment above the minimum also confirms, and producers cannot buy", async () => {
 const drop = await create();
 expect((await call("POST", `/group-buys/${drop.id}/participants`, seller, { requestedLbs: "55" })).statusCode).toBe(403);
 expect((await call("POST", `/group-buys/${drop.id}/participants`, buyer, { requestedLbs: "55" })).statusCode).toBe(201);
 expect((await call("GET", `/group-buys/${drop.id}`, seller)).json().groupBuy.status).toBe("matched");
});
it("bidding routes no longer exist", async () => { const drop = await create(); for (const path of ["bids", "select-bid"]) expect((await call("POST", `/group-buys/${drop.id}/${path}`, seller, {})).statusCode).toBe(404); });
it("only the seller can cancel an open drop and cancelled drops reject commitments", async () => {
 const drop = await create(); const url = `/group-buys/${drop.id}`;
 expect((await call("PATCH", `${url}/status`, buyer, { status: "cancelled" })).statusCode).toBe(403);
 expect((await call("PATCH", `${url}/status`, seller, { status: "cancelled" })).statusCode).toBe(200);
 expect((await call("POST", `${url}/participants`, buyer, { requestedLbs: "1" })).statusCode).toBe(409);
});
it("expires unconfirmed drops at the commitment deadline, idempotently", async () => {
 const drop = await create(); await call("POST", `/group-buys/${drop.id}/participants`, buyer, { requestedLbs: "1" });
 await prisma.groupBuy.update({ where: { id: drop.id }, data: { joinDeadline: new Date(Date.now() - 1000) } });
 expect((await call("POST", `/group-buys/${drop.id}/participants`, other, { requestedLbs: "1" })).statusCode).toBe(409);
 expect((await call("POST", "/jobs/resolve-group-buys", operator)).json().resolvedGroupBuyIds).toContain(drop.id);
 expect((await call("POST", "/jobs/resolve-group-buys", operator)).json().resolvedGroupBuyIds).not.toContain(drop.id);
});
it("producer type persists and rejects unsupported categories", async () => {
 for (const producerType of ["at_home", "local_farmer", "large_scale_farmer"] as const) {
 const account = await signup(app, producerSignup({ producerType }));
 expect((await call("GET", "/me", account)).json().user.producerProfile.producerType).toBe(producerType);
 expect((await call("PATCH", "/me", account, { producerType: "at_home" })).json().user.producerProfile.producerType).toBe("at_home");
 }
 expect((await call("PATCH", "/me", seller, { producerType: "factory" })).statusCode).toBe(400);
});
