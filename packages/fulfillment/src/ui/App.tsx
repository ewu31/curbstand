import { useEffect, useState } from "react"
import type { PriceBenchmarkResponse } from "../benchmark/service"
import { DEPOSIT_DISCLAIMER, DEPOSIT_STATUS_COPY, type DepositStatus, type GroupBuyStatus } from "../types"
import { MarketComparison } from "./MarketComparison"

type Participant = {
  id: string
  userId: string
  requestedLbs: string
  depositAmount: string | null
  depositStatus: DepositStatus | null
  depositStatusLabel: string | null
  completionStatus: "pending" | "completed"
  completionMethod: "qr" | "manual" | null
}

type Detail = {
  id: string
  produceType: string
  status: GroupBuyStatus
  pickupLocationLabel: string
  selectedBid: { pricePerLb: string; producerId: string } | null
  depositDisclaimer: string
  participants: Participant[]
  events: Array<{ id: string; eventType: string; actorUserId: string; payload: Record<string, unknown>; createdAt: string }>
}

type ActorOption = { id: string; name: string; role: string }
type GroupBuySummary = { id: string; produceType: string; status: GroupBuyStatus }

type ApiDetail = {
  id: string
  produceType: string
  status: GroupBuyStatus
  pickupLocation?: { name?: string }
  selectedBidId: string | null
  bids: Array<{ id: string; pricePerLb: number | string; producerId: string }>
  participants: Array<{
    id: string
    userId: string
    requestedLbs: number | string
    depositAmount: number | string | null
    depositStatus: DepositStatus | null
    completionStatus: string
    completionMethod?: string | null
  }>
  events: Array<{ id: string; eventType: string; actorUserId?: string | null; payload: Record<string, unknown>; createdAt: string }>
}

const STATUS_LABEL: Record<GroupBuyStatus, string> = {
  open: "Open",
  funding: "Funding",
  matched: "Matched",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
}

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request(actorId: string, path: string, init?: { method?: string; body?: unknown }) {
  const hasBody = init?.body !== undefined
  const response = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(actorId ? { "x-user-id": actorId } : {}),
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
  })
  const data = (await response.json()) as { data?: unknown; error?: { message?: string } | string; message?: string }
  if (!response.ok) {
    const message =
      typeof data.error === "object" && data.error?.message
        ? data.error.message
        : typeof data.message === "string"
          ? data.message
          : "Request failed."
    throw new ApiError(message, response.status)
  }
  return data.data ?? data
}

function moneyString(value: number | string | null): string | null {
  if (value === null) return null
  const amount = typeof value === "number" ? value : Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : String(value)
}

function adaptDetail(raw: ApiDetail): Detail {
  const selected = raw.bids.find((bid) => bid.id === raw.selectedBidId) ?? null
  return {
    id: raw.id,
    produceType: raw.produceType,
    status: raw.status,
    pickupLocationLabel: raw.pickupLocation?.name ?? "Pickup",
    selectedBid: selected ? { pricePerLb: moneyString(selected.pricePerLb) ?? selected.pricePerLb.toString(), producerId: selected.producerId } : null,
    depositDisclaimer: DEPOSIT_DISCLAIMER,
    participants: raw.participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      requestedLbs: moneyString(participant.requestedLbs) ?? String(participant.requestedLbs),
      depositAmount: moneyString(participant.depositAmount),
      depositStatus: participant.depositStatus,
      depositStatusLabel: participant.depositStatus ? DEPOSIT_STATUS_COPY[participant.depositStatus] : null,
      completionStatus: participant.completionStatus === "completed" ? "completed" : "pending",
      completionMethod: participant.completionMethod === "qr" || participant.completionMethod === "manual" ? participant.completionMethod : null,
    })),
    events: raw.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actorUserId: event.actorUserId ?? "",
      payload: event.payload,
      createdAt: event.createdAt,
    })),
  }
}

export function App() {
  const [actors, setActors] = useState<ActorOption[]>([])
  const [actorId, setActorId] = useState("")
  const [groupBuys, setGroupBuys] = useState<GroupBuySummary[]>([])
  const [groupBuyId, setGroupBuyId] = useState("")
  const [detail, setDetail] = useState<Detail | null>(null)
  const [benchmark, setBenchmark] = useState<PriceBenchmarkResponse | null>(null)
  const [benchmarkError, setBenchmarkError] = useState(false)
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void request("", "/dev/actors")
      .then((rows) => {
        if (cancelled) return
        const next = rows as ActorOption[]
        setActors(next)
        setActorId((current) => current || next.find((actor) => actor.name === "Alice Chen")?.id || next[0]?.id || "")
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "The API is not reachable.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!actorId && actors.length === 0) return
    let cancelled = false
    async function load() {
      setLoadError(null)
      try {
        const list = (await request(actorId, "/group-buys")) as GroupBuySummary[]
        if (cancelled) return
        setGroupBuys(list)
        const id = groupBuyId || list[0]?.id || ""
        if (!groupBuyId && id) setGroupBuyId(id)
        if (!id) {
          setDetail(null)
          setLoadError("No open group buys. Seed the database with npm run db:seed.")
          return
        }
        const raw = (await request(actorId, `/group-buys/${id}`)) as ApiDetail
        if (cancelled) return
        const next = adaptDetail(raw)
        setDetail(next)
        const entries = await Promise.all(
          next.participants.map(async (participant) => {
            try {
              const token = (await request(actorId, `/group-buys/${id}/participants/${participant.id}/check-in-token`)) as { token?: string }
              return [participant.id, token.token ?? ""] as const
            } catch {
              return [participant.id, ""] as const
            }
          }),
        )
        if (!cancelled) setTokens(Object.fromEntries(entries.filter((entry) => entry[1])))
        if (!actorId) {
          setBenchmark(null)
          setBenchmarkError(true)
          return
        }
        try {
          const nextBenchmark = (await request(
            actorId,
            `/price-benchmarks?produceType=${encodeURIComponent(next.produceType)}&region=seattle-puget-sound`,
          )) as PriceBenchmarkResponse
          if (!cancelled) {
            setBenchmark(nextBenchmark)
            setBenchmarkError(false)
          }
        } catch {
          if (!cancelled) {
            setBenchmark(null)
            setBenchmarkError(true)
          }
        }
      } catch (error) {
        if (cancelled) return
        setDetail(null)
        setTokens({})
        setBenchmark(null)
        setBenchmarkError(true)
        setLoadError(error instanceof Error ? error.message : "Request failed.")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [actorId, actors.length, groupBuyId, reloadKey])

  function displayName(userId: string) {
    return actors.find((actor) => actor.id === userId)?.name ?? userId
  }

  async function act(path: string, body?: unknown, method = "POST") {
    setBusy(true)
    setActionError(null)
    try {
      await request(actorId, path, { method, body })
      setReloadKey((value) => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Request failed.")
    } finally {
      setBusy(false)
    }
  }

  const checkedIn = detail?.participants.filter((participant) => participant.completionStatus === "completed").length ?? 0

  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">Curbstand · Task 4</p>
        <h1>Pickup fulfillment</h1>
        <p>Deposits, check-in, and the supermarket comparison read from the API. Nothing on this page moves money.</p>
      </header>

      <section className="toolbar card">
        <fieldset>
          <legend>Act as</legend>
          <div className="actor-row">
            {actors.map((actor) => (
              <button
                key={actor.id}
                type="button"
                aria-pressed={actorId === actor.id}
                data-testid={`actor-${actor.role}-${actor.name.split(" ")[0]?.toLowerCase()}`}
                onClick={() => {
                  setActionError(null)
                  setActorId(actor.id)
                }}
              >
                {actor.name} · {actor.role}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={actorId === ""}
              data-testid="actor-signed-out"
              onClick={() => {
                setActionError(null)
                setActorId("")
              }}
            >
              Signed out
            </button>
          </div>
        </fieldset>
        <label>
          Group buy
          <select
            value={groupBuyId}
            onChange={(event) => {
              setActionError(null)
              setGroupBuyId(event.target.value)
            }}
          >
            {groupBuys.map((groupBuy) => (
              <option key={groupBuy.id} value={groupBuy.id}>
                {groupBuy.produceType} · {STATUS_LABEL[groupBuy.status]}
              </option>
            ))}
            {groupBuyId && !groupBuys.some((groupBuy) => groupBuy.id === groupBuyId) ? (
              <option value={groupBuyId}>{detail?.produceType ?? "Current"} · {detail ? STATUS_LABEL[detail.status] : "saved"}</option>
            ) : null}
          </select>
        </label>
      </section>

      {loadError ? (
        <p className="alert" role="alert" data-testid="load-error">
          {loadError}
        </p>
      ) : null}
      {actionError ? (
        <p className="alert" role="alert" data-testid="action-error">
          {actionError}
        </p>
      ) : null}

      {detail ? (
        <section className="layout">
          <div className="stack">
            <article className="card">
              <p className="eyebrow">Group buy · {detail.produceType}</p>
              <h2 data-testid="group-buy-status">{STATUS_LABEL[detail.status]}</h2>
              <p>
                Pickup at {detail.pickupLocationLabel}. Selected bid{" "}
                {detail.selectedBid ? `$${detail.selectedBid.pricePerLb}/lb` : "not selected"}. {checkedIn} of{" "}
                {detail.participants.length} participants checked in.
              </p>
              <div className="actor-row">
                <button type="button" data-testid="complete-group-buy" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/complete`)}>
                  Mark group buy completed
                </button>
                <button type="button" data-testid="cancel-group-buy" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/cancel`)}>
                  Cancel and mark refunds
                </button>
              </div>
            </article>

            <article className="card">
              <h2>Deposits</h2>
              <p className="disclaimer" data-testid="deposit-disclaimer">
                {detail.depositDisclaimer}
              </p>
              <ul className="people">
                {detail.participants.map((participant) => (
                  <li key={participant.id}>
                    <header>
                      <strong>{displayName(participant.userId)}</strong>
                      <span>
                        {participant.requestedLbs} lb · {participant.depositAmount ? `$${participant.depositAmount}` : "No amount"}
                      </span>
                    </header>
                    <p data-testid={`deposit-status-${participant.id}`}>{participant.depositStatusLabel}</p>
                    <div className="actor-row">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(`/group-buys/${detail.id}/participants/${participant.id}/deposit`, { status: "confirmed_manual" }, "PATCH")
                        }
                      >
                        Confirm manually
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(`/group-buys/${detail.id}/participants/${participant.id}/deposit`, { status: "refunded_manual" }, "PATCH")
                        }
                      >
                        Mark refunded manually
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(`/group-buys/${detail.id}/participants/${participant.id}/deposit`, { status: "forfeited_manual" }, "PATCH")
                        }
                      >
                        Mark forfeited manually
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="card">
              <h2>Check-in</h2>
              <ul className="people">
                {detail.participants.map((participant) => (
                  <li key={participant.id}>
                    <header>
                      <strong>{displayName(participant.userId)}</strong>
                      <span>
                        {participant.completionStatus === "completed"
                          ? `Checked in${participant.completionMethod ? ` · ${participant.completionMethod}` : ""}`
                          : "Not checked in"}
                      </span>
                    </header>
                    {tokens[participant.id] ? (
                      <p>
                        QR payload <code data-testid={`qr-payload-${participant.id}`}>{tokens[participant.id]}</code>
                      </p>
                    ) : (
                      <p>QR payload hidden for this actor.</p>
                    )}
                    <div className="actor-row">
                      <button
                        type="button"
                        data-testid={`qr-check-in-${participant.id}`}
                        disabled={busy || !tokens[participant.id]}
                        onClick={() => void act(`/group-buys/${detail.id}/check-in`, { token: tokens[participant.id] })}
                      >
                        Submit QR check-in
                      </button>
                      <button
                        type="button"
                        data-testid={`manual-check-in-${participant.id}`}
                        disabled={busy}
                        onClick={() =>
                          void act(`/group-buys/${detail.id}/check-in`, { participantId: participant.id, method: "manual" })
                        }
                      >
                        Manual check-in
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="card">
              <h2>Event history</h2>
              <ol data-testid="event-history">
                {detail.events.map((event) => (
                  <li key={event.id} data-testid="event">
                    <strong>{event.eventType}</strong>
                    <span>{displayName(event.actorUserId)}</span>
                    <code>{JSON.stringify(event.payload)}</code>
                  </li>
                ))}
              </ol>
            </article>
          </div>
          <MarketComparison
            produceType={detail.produceType}
            groupBuyPricePerLb={detail.selectedBid?.pricePerLb ?? null}
            benchmark={benchmark}
            error={benchmarkError}
          />
        </section>
      ) : (
        <MarketComparison produceType="kale" groupBuyPricePerLb={null} benchmark={benchmark} error={benchmarkError} />
      )}
      {benchmark && !benchmark.enabled ? (
        <p data-testid="comparison-hidden">Market comparison is turned off. Deposits and check-in still work.</p>
      ) : null}
    </main>
  )
}
