import { describe, expect, it } from "vitest"
import { createFulfillmentApi, type ApiRequest } from "./api"
import { demoSampleEstimate } from "./benchmark/sample"
import { getPriceBenchmark } from "./benchmark/service"
import { eventPayload } from "./events"
import { MemoryFulfillmentRepository, MemoryTokenStore } from "./memory"
import { DEMO_ACTORS, GROUP_BUY_ID, PARTICIPANTS, seedScenario } from "./seed"
import { DEPOSIT_STATUS_COPY, type Actor, type BenchmarkRecord, type EstimateMode } from "./types"

const NOW = new Date("2026-10-18T01:00:00.000Z")

async function setup(options?: { scenario?: "ready_for_pickup" | "matched"; mode?: EstimateMode; enabled?: boolean }) {
  const repo = new MemoryFulfillmentRepository()
  const tokens = new MemoryTokenStore()
  await seedScenario(repo, tokens, options?.scenario ?? "ready_for_pickup", NOW)
  let enabled = options?.enabled ?? true
  let mode = options?.mode ?? "demo_sample"
  let calls = 0
  const api = createFulfillmentApi({
    repo,
    tokens,
    now: () => NOW,
    priceComparisonEnabled: () => enabled,
    estimateMode: () => mode,
    estimate: async (input) => {
      calls += 1
      return demoSampleEstimate(input)
    },
  })
  return {
    api,
    repo,
    tokens,
    calls: () => calls,
    setEnabled(value: boolean) {
      enabled = value
    },
    setMode(value: EstimateMode) {
      mode = value
    },
  }
}

function call(
  api: (request: ApiRequest) => Promise<{ status: number; body: unknown }>,
  actor: Actor | null,
  method: string,
  path: string,
  body: unknown = null,
) {
  const url = new URL(path, "http://localhost")
  return api({ method, path: url.pathname, query: url.searchParams, body, actor })
}

describe("task 4 fulfillment", () => {
  it("confirms deposits without claiming money moved and blocks other customers", async () => {
    const { api, repo } = await setup()
    const outsider = await call(api, DEMO_ACTORS.erin, "PATCH", `/group-buys/${GROUP_BUY_ID}/participants/${PARTICIPANTS.bob}/deposit`, {
      status: "forfeited_manual",
    })
    expect(outsider.status).toBe(403)

    const self = await call(api, DEMO_ACTORS.bob, "PATCH", `/group-buys/${GROUP_BUY_ID}/participants/${PARTICIPANTS.bob}/deposit`, {
      status: "confirmed_manual",
    })
    expect(self.status).toBe(403)

    const signedOut = await call(api, null, "PATCH", `/group-buys/${GROUP_BUY_ID}/participants/${PARTICIPANTS.bob}/deposit`, {
      status: "confirmed_manual",
    })
    expect(signedOut.status).toBe(401)

    const confirmed = await call(api, DEMO_ACTORS.alice, "PATCH", `/group-buys/${GROUP_BUY_ID}/participants/${PARTICIPANTS.bob}/deposit`, {
      status: "confirmed_manual",
    })
    expect(confirmed.status).toBe(200)
    const confirmedBody = confirmed.body as { paymentProcessed: boolean; disclaimer: string; participant: { depositStatusLabel: string } }
    expect(confirmedBody.paymentProcessed).toBe(false)
    expect(confirmedBody.disclaimer.toLowerCase()).not.toMatch(/paid|charged|captured/)
    expect(confirmedBody.participant.depositStatusLabel).toBe(DEPOSIT_STATUS_COPY.confirmed_manual)

    const again = await call(api, DEMO_ACTORS.operator, "PATCH", `/group-buys/${GROUP_BUY_ID}/participants/${PARTICIPANTS.bob}/deposit`, {
      status: "confirmed_manual",
    })
    expect(again.status).toBe(200)
    expect((again.body as { idempotent: boolean }).idempotent).toBe(true)
    const confirmations = (await repo.listEvents(GROUP_BUY_ID)).filter((event) => event.eventType === "deposit_confirmed_manual")
    expect(confirmations).toHaveLength(1)

    const detail = await call(api, DEMO_ACTORS.bob, "GET", `/group-buys/${GROUP_BUY_ID}`)
    expect(detail.status).toBe(200)
    const detailBody = detail.body as { participants: Array<{ depositStatus: string }>; paymentProcessed: boolean }
    expect(detailBody.paymentProcessed).toBe(false)
    expect(detailBody.participants.find((participant) => participant.depositStatus === "confirmed_manual")).toBeTruthy()
    expect(JSON.stringify(detail.body)).not.toContain("checkInTokenHash")
  })

  it("checks in with a QR token or a manual fallback, then completes idempotently", async () => {
    const { api, repo, tokens } = await setup()
    const issued = await call(api, DEMO_ACTORS.bob, "GET", `/group-buys/${GROUP_BUY_ID}/participants/${PARTICIPANTS.bob}/check-in-token`)
    expect(issued.status).toBe(200)
    const token = (issued.body as { token: string }).token
    const stored = await repo.getParticipant(PARTICIPANTS.bob)
    expect(stored?.checkInTokenHash).not.toBe(token)
    expect(await tokens.get(PARTICIPANTS.bob)).toBe(token)

    const ownerScan = await call(api, DEMO_ACTORS.alice, "POST", `/group-buys/${GROUP_BUY_ID}/check-in`, { token })
    expect(ownerScan.status).toBe(403)
    const ownerManual = await call(api, DEMO_ACTORS.alice, "POST", `/group-buys/${GROUP_BUY_ID}/check-in`, {
      participantId: PARTICIPANTS.cara,
      method: "manual",
    })
    expect(ownerManual.status).toBe(403)

    const qr = await call(api, DEMO_ACTORS.dana, "POST", `/group-buys/${GROUP_BUY_ID}/check-in`, { token })
    expect(qr.status).toBe(200)
    expect((qr.body as { participant: { completionMethod: string } }).participant.completionMethod).toBe("qr")
    const qrAgain = await call(api, DEMO_ACTORS.bob, "POST", `/group-buys/${GROUP_BUY_ID}/check-in`, { token })
    expect((qrAgain.body as { idempotent: boolean }).idempotent).toBe(true)

    const manual = await call(api, DEMO_ACTORS.cara, "POST", `/group-buys/${GROUP_BUY_ID}/check-in`, {
      participantId: PARTICIPANTS.cara,
      method: "manual",
    })
    expect(manual.status).toBe(200)
    expect((manual.body as { participant: { completionMethod: string } }).participant.completionMethod).toBe("manual")

    const tooSoon = await call(api, DEMO_ACTORS.alice, "POST", `/group-buys/${GROUP_BUY_ID}/complete`)
    expect(tooSoon.status).toBe(200)
    const completed = tooSoon.body as { status: string; idempotent: boolean }
    expect(completed.status).toBe("completed")
    expect(completed.idempotent).toBe(false)

    const repeat = await call(api, DEMO_ACTORS.dana, "POST", `/group-buys/${GROUP_BUY_ID}/complete`)
    expect(repeat.status).toBe(200)
    expect((repeat.body as { idempotent: boolean }).idempotent).toBe(true)
    expect((await repo.listEvents(GROUP_BUY_ID)).filter((event) => event.eventType === "group_buy_completed")).toHaveLength(1)
    expect((await repo.listEvents(GROUP_BUY_ID)).filter((event) => event.eventType === "participant_checked_in")).toHaveLength(2)

    const history = JSON.stringify(await repo.listEvents(GROUP_BUY_ID))
    expect(history).not.toContain(token)
    expect(history).not.toMatch(/password|apiKey|email|card|authorization/i)
    for (const event of await repo.listEvents(GROUP_BUY_ID)) {
      expect(event.payload).not.toHaveProperty("token")
      expect(event.actorUserId.startsWith("user_")).toBe(true)
    }
  })

  it("refunds confirmed deposits on cancel and leaves pending intents alone", async () => {
    const { api, repo } = await setup({ scenario: "matched" })
    const denied = await call(api, DEMO_ACTORS.erin, "POST", `/group-buys/${GROUP_BUY_ID}/cancel`)
    expect(denied.status).toBe(403)

    const cancelled = await call(api, DEMO_ACTORS.alice, "POST", `/group-buys/${GROUP_BUY_ID}/cancel`)
    expect(cancelled.status).toBe(200)
    expect((cancelled.body as { paymentProcessed: boolean }).paymentProcessed).toBe(false)
    const participants = await repo.listParticipants(GROUP_BUY_ID)
    expect(participants.find((participant) => participant.id === PARTICIPANTS.bob)?.depositStatus).toBe("refunded_manual")
    expect(participants.find((participant) => participant.id === PARTICIPANTS.cara)?.depositStatus).toBe("pending")

    const again = await call(api, DEMO_ACTORS.operator, "POST", `/group-buys/${GROUP_BUY_ID}/cancel`)
    expect((again.body as { idempotent: boolean }).idempotent).toBe(true)
    expect((await repo.listEvents(GROUP_BUY_ID)).filter((event) => event.eventType === "group_buy_cancelled")).toHaveLength(1)

    const ready = await setup()
    const blocked = await call(ready.api, DEMO_ACTORS.alice, "POST", `/group-buys/${GROUP_BUY_ID}/cancel`)
    expect(blocked.status).toBe(409)
  })

  it("keeps check-in and completion working when the price comparison is disabled or Gemini is down", async () => {
    const disabled = await setup({ enabled: false })
    const hidden = await call(
      disabled.api,
      DEMO_ACTORS.alice,
      "GET",
      `/price-benchmarks?produceType=kale&region=seattle-puget-sound`,
    )
    expect(hidden.body).toEqual({ enabled: false })
    expect(disabled.calls()).toBe(0)
    const manual = await call(disabled.api, DEMO_ACTORS.dana, "POST", `/group-buys/${GROUP_BUY_ID}/check-in`, {
      participantId: PARTICIPANTS.bob,
      method: "manual",
    })
    expect(manual.status).toBe(200)

    const down = await setup({ mode: "off" })
    await down.repo.saveBenchmark(expiredBenchmark())
    const unavailable = await call(down.api, DEMO_ACTORS.alice, "GET", `/price-benchmarks?produceType=Kale&region=Seattle`)
    expect(unavailable.status).toBe(200)
    const body = unavailable.body as Record<string, unknown>
    expect(body.status).toBe("unavailable")
    expect(body.lastSuccessfulRetrievedAt).toBe("2026-10-17T00:00:00.000Z")
    expect(body).not.toHaveProperty("retailLow")
    expect(body).not.toHaveProperty("retailHigh")
    expect(body.distributionBaselinePerLb).toBe("0.40")
    expect(down.calls()).toBe(0)
    const completeAttempt = await call(down.api, DEMO_ACTORS.alice, "POST", `/group-buys/${GROUP_BUY_ID}/complete`)
    expect(completeAttempt.status).toBe(409)
  })

  it("caches a labeled sample estimate and does not store an invalid Gemini payload", async () => {
    const { api, repo, calls } = await setup()
    const first = await call(api, DEMO_ACTORS.alice, "GET", `/price-benchmarks?produceType=kale&region=seattle-puget-sound`)
    const second = await call(api, DEMO_ACTORS.alice, "GET", `/price-benchmarks?produceType=kale&region=seattle-puget-sound`)
    expect(first.status).toBe(200)
    expect(second.body).toMatchObject({
      enabled: true,
      status: "available",
      source: "demo_sample",
      approximation: true,
      retailLow: "1.49",
      retailHigh: "2.29",
      currency: "USD",
      unit: "lb",
    })
    expect(calls()).toBe(1)
    const stored = await repo.getLatestBenchmark("kale", "seattle-puget-sound")
    expect(stored?.model).toBe("demo-sample")
    expect(stored?.promptHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(second.body)).not.toContain(stored?.promptHash ?? "missing")

    const invalid = await setup()
    const apiInvalid = createFulfillmentApi({
      repo: invalid.repo,
      tokens: invalid.tokens,
      now: () => NOW,
      priceComparisonEnabled: () => true,
      estimateMode: () => "gemini",
      estimate: async () => ({
        source: "gemini",
        retailLowPerLb: "4.00",
        retailHighPerLb: "1.00",
        model: "gemini-2.5-flash",
        promptVersion: "retail-range-v1",
        promptHash: "abc",
      }),
    })
    const failed = await call(apiInvalid, DEMO_ACTORS.alice, "GET", `/price-benchmarks?produceType=kale`)
    expect(failed.body).toMatchObject({ status: "unavailable", lastSuccessfulRetrievedAt: null })
    expect(failed.body).not.toHaveProperty("retailLow")
    expect(await invalid.repo.getLatestBenchmark("kale", "seattle-puget-sound")).toBeNull()
  })

  it("rejects event fields that could carry secrets", () => {
    expect(() =>
      eventPayload("participant_checked_in", { participantId: "part_bob", method: "qr", token: "secret" }),
    ).toThrow(/not allowed/)
    for (const copy of Object.values(DEPOSIT_STATUS_COPY)) {
      expect(copy.toLowerCase()).not.toMatch(/paid|charged|captured|card|bank/)
    }
  })
})

function expiredBenchmark(): BenchmarkRecord {
  return {
    id: "bench_old",
    produceType: "kale",
    region: "seattle-puget-sound",
    currency: "USD",
    unit: "lb",
    retailLow: "9.99",
    retailHigh: "10.99",
    source: "gemini",
    model: "gemini-2.5-flash",
    promptVersion: "retail-range-v1",
    promptHash: "a".repeat(64),
    responseJson: { retailLowPerLb: "9.99", retailHighPerLb: "10.99", currency: "USD", unit: "lb" },
    retrievedAt: "2026-10-17T00:00:00.000Z",
    expiresAt: "2026-10-17T06:00:00.000Z",
  }
}

describe("price benchmark service", () => {
  it("normalizes produce and region before storing a fresh estimate", async () => {
    const repo = new MemoryFulfillmentRepository()
    const response = await getPriceBenchmark(
      repo,
      {
        enabled: true,
        mode: "demo_sample",
        estimate: demoSampleEstimate,
        now: NOW,
        ttlSeconds: 60,
      },
      { produceType: " Tomatoes ", region: "Puget Sound" },
    )
    expect(response).toMatchObject({ produceType: "tomatoes", region: "seattle-puget-sound", status: "available" })
  })
})
