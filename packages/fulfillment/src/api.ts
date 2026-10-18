import { getPriceBenchmark } from "./benchmark/service"
import {
  checkInManually,
  checkInWithQr,
  completeGroupBuy,
  getCheckInToken,
} from "./checkin"
import { canViewGroupBuy, changeDepositStatus, refundConfirmedDepositsOnCancel, toPublicParticipant } from "./deposits"
import { FulfillmentError } from "./errors"
import type { CheckInTokenStore, FulfillmentRepository } from "./repository"
import {
  DEPOSIT_DISCLAIMER,
  MANUAL_DEPOSIT_STATUSES,
  type Actor,
  type EstimateMode,
  type ManualDepositStatus,
  type Region,
  type RetailEstimate,
} from "./types"

export type ApiRequest = {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  actor: Actor | null
}

export type ApiResponse = {
  status: number
  body: unknown
}

export type DemoControls = {
  reset(scenario: "ready_for_pickup" | "matched"): Promise<void>
  setPriceComparisonEnabled(enabled: boolean): void
  setEstimateMode(mode: EstimateMode): void
  capabilities(): {
    geminiConfigured: boolean
    priceComparisonEnabled: boolean
    estimateMode: EstimateMode
  }
}

export type FulfillmentDeps = {
  repo: FulfillmentRepository
  tokens: CheckInTokenStore
  now: () => Date
  priceComparisonEnabled: () => boolean
  estimateMode: () => EstimateMode
  estimate: ((input: { produceType: string; region: Region }) => Promise<RetailEstimate>) | null
  demoControls?: DemoControls
}

export const TASK4_ROUTES = [
  "GET /group-buys/:id",
  "PATCH /group-buys/:id/participants/:participantId/deposit",
  "GET /group-buys/:id/participants/:participantId/check-in-token",
  "POST /group-buys/:id/check-in",
  "POST /group-buys/:id/complete",
  "POST /group-buys/:id/cancel",
  "GET /price-benchmarks?produceType=&region=",
] as const

function json(status: number, body: unknown): ApiResponse {
  return { status, body }
}

function fail(error: FulfillmentError): ApiResponse {
  return json(error.status, { error: { code: error.code, message: error.message } })
}

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || body === undefined) return {}
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FulfillmentError(400, "bad_request", "Request body must be a JSON object.")
  }
  return body as Record<string, unknown>
}

function isManualStatus(value: unknown): value is ManualDepositStatus {
  return typeof value === "string" && MANUAL_DEPOSIT_STATUSES.includes(value as ManualDepositStatus)
}

export function createFulfillmentApi(deps: FulfillmentDeps) {
  return async function handle(request: ApiRequest): Promise<ApiResponse> {
    try {
      return await route(deps, request)
    } catch (error) {
      if (error instanceof FulfillmentError) return fail(error)
      return json(500, { error: { code: "internal", message: "Request failed." } })
    }
  }
}

async function route(deps: FulfillmentDeps, request: ApiRequest): Promise<ApiResponse> {
  const path = request.path.replace(/\/$/, "") || "/"
  const parts = path.split("/").filter(Boolean)
  const method = request.method.toUpperCase()

  if (method === "GET" && parts[0] === "price-benchmarks" && parts.length === 1) {
    if (!request.actor) throw new FulfillmentError(401, "unauthorized", "Sign in is required.")
    const body = await getPriceBenchmark(
      deps.repo,
      {
        enabled: deps.priceComparisonEnabled(),
        mode: deps.estimateMode(),
        estimate: deps.estimate,
        now: deps.now(),
      },
      {
        produceType: request.query.get("produceType"),
        region: request.query.get("region"),
      },
    )
    return json(200, body)
  }

  if (parts[0] === "demo") {
    if (!deps.demoControls) throw new FulfillmentError(404, "not_found", "Route not found.")
    if (!request.actor) throw new FulfillmentError(401, "unauthorized", "Sign in is required.")
    return await demoRoute(deps.demoControls, method, parts, request.body)
  }

  if (parts[0] !== "group-buys" || !parts[1]) throw new FulfillmentError(404, "not_found", "Route not found.")
  const groupBuyId = decodeURIComponent(parts[1])

  if (method === "GET" && parts.length === 2) return json(200, await groupBuyDetail(deps, request.actor, groupBuyId))

  if (method === "POST" && parts[2] === "check-in" && parts.length === 3) {
    const body = readObject(request.body)
    const hasToken = typeof body.token === "string"
    const manual = body.method === "manual"
    if (hasToken === manual) {
      throw new FulfillmentError(400, "bad_request", "Send either a QR token or a manual participant check-in.")
    }
    if (hasToken) {
      return json(200, await checkInWithQr(deps.repo, request.actor, groupBuyId, body.token as string, deps.now()))
    }
    if (typeof body.participantId !== "string") {
      throw new FulfillmentError(400, "bad_request", "Manual check-in requires a participant id.")
    }
    return json(200, await checkInManually(deps.repo, request.actor, groupBuyId, body.participantId, deps.now()))
  }

  if (method === "POST" && parts[2] === "complete" && parts.length === 3) {
    return json(200, await completeGroupBuy(deps.repo, request.actor, groupBuyId, deps.now()))
  }

  if (method === "POST" && parts[2] === "cancel" && parts.length === 3) {
    return json(200, await refundConfirmedDepositsOnCancel(deps.repo, request.actor, groupBuyId, deps.now()))
  }

  if (parts[2] === "participants" && parts[3] && parts[4] === "deposit" && parts.length === 5) {
    if (method !== "PATCH") throw new FulfillmentError(404, "not_found", "Route not found.")
    const body = readObject(request.body)
    if (!isManualStatus(body.status)) {
      throw new FulfillmentError(400, "bad_request", "Deposit status must be confirmed_manual, refunded_manual, or forfeited_manual.")
    }
    return json(
      200,
      await changeDepositStatus(deps.repo, request.actor, groupBuyId, decodeURIComponent(parts[3]), body.status, deps.now()),
    )
  }

  if (method === "GET" && parts[2] === "participants" && parts[3] && parts[4] === "check-in-token" && parts.length === 5) {
    return json(
      200,
      await getCheckInToken(deps.repo, deps.tokens, request.actor, groupBuyId, decodeURIComponent(parts[3])),
    )
  }

  throw new FulfillmentError(404, "not_found", "Route not found.")
}

async function groupBuyDetail(deps: FulfillmentDeps, actor: Actor | null, groupBuyId: string) {
  if (!actor) throw new FulfillmentError(401, "unauthorized", "Sign in is required.")
  const groupBuy = await deps.repo.getGroupBuy(groupBuyId)
  if (!groupBuy) throw new FulfillmentError(404, "not_found", "Group buy not found.")
  const participants = await deps.repo.listParticipants(groupBuyId)
  if (!canViewGroupBuy(actor, groupBuy, participants)) {
    throw new FulfillmentError(403, "forbidden", "You cannot view this group buy.")
  }
  const events = await deps.repo.listEvents(groupBuyId)
  const counts = { pending: 0, confirmed_manual: 0, refunded_manual: 0, forfeited_manual: 0 }
  for (const participant of participants) {
    if (participant.depositStatus) counts[participant.depositStatus] += 1
  }
  return {
    id: groupBuy.id,
    produceType: groupBuy.produceType,
    region: groupBuy.region,
    status: groupBuy.status,
    pickupLocationLabel: groupBuy.pickupLocationLabel,
    currency: "USD" as const,
    quantityUnit: "lb" as const,
    selectedBid: groupBuy.selectedBid,
    paymentProcessed: false as const,
    depositDisclaimer: DEPOSIT_DISCLAIMER,
    depositSummary: { currency: "USD" as const, configuredAmount: "5.00", paymentProcessed: false as const, counts },
    participants: participants.map(toPublicParticipant),
    events,
    updatedAt: groupBuy.updatedAt,
  }
}

async function demoRoute(demo: DemoControls, method: string, parts: string[], body: unknown): Promise<ApiResponse> {
  if (method === "GET" && parts.length === 2 && parts[1] === "capabilities") {
    return json(200, demo.capabilities())
  }
  if (method === "POST" && parts.length === 2 && parts[1] === "reset") {
    const record = readObject(body)
    if (record.scenario !== "ready_for_pickup" && record.scenario !== "matched") {
      throw new FulfillmentError(400, "bad_request", "Scenario must be ready_for_pickup or matched.")
    }
    await demo.reset(record.scenario)
    return json(200, { scenario: record.scenario })
  }
  if (method === "POST" && parts.length === 2 && parts[1] === "price-comparison") {
    const record = readObject(body)
    if (typeof record.enabled !== "boolean") {
      throw new FulfillmentError(400, "bad_request", "enabled must be true or false.")
    }
    demo.setPriceComparisonEnabled(record.enabled)
    return json(200, demo.capabilities())
  }
  if (method === "POST" && parts.length === 2 && parts[1] === "estimate-mode") {
    const record = readObject(body)
    if (record.mode !== "gemini" && record.mode !== "demo_sample" && record.mode !== "off") {
      throw new FulfillmentError(400, "bad_request", "mode must be gemini, demo_sample, or off.")
    }
    demo.setEstimateMode(record.mode)
    return json(200, demo.capabilities())
  }
  throw new FulfillmentError(404, "not_found", "Route not found.")
}
