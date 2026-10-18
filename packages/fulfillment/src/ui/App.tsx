import { useEffect, useState, type FormEvent } from "react"
import type { PriceBenchmarkResponse } from "../benchmark/service"
import { DEPOSIT_DISCLAIMER, DEPOSIT_STATUS_COPY, type DepositStatus, type GroupBuyStatus } from "../types"
import { MarketComparison } from "./MarketComparison"

type DemoAccount = { email: string; name: string; role: string }
type Session = { token: string; userId: string; name: string; email: string; role: string; isOperator: boolean }

type Participant = {
  id: string
  userId: string
  userName: string
  requestedLbs: string
  depositAmountUsd: string
  depositStatus: DepositStatus
  completionStatus: string
  completedAt: string | null
}

type Detail = {
  id: string
  produceType: { id: string; name: string }
  status: GroupBuyStatus
  pickupLocation: { name: string }
  selectedBid: { pricePerLbUsd: string; producerId: string } | null
  participants: Participant[]
  events: Array<{ id: string; eventType: string; actorUserId: string | null; payload: Record<string, unknown>; createdAt: string }>
}

type GroupBuySummary = { id: string; status: GroupBuyStatus; produceType: { id: string; name: string } }

type ChatMessage = { id: string; authorUserId: string; authorName: string; body: string; createdAt: string }
type TextSummary = { sent: number; skippedNoPhone: number; notConfigured: number; failed: number }
type Chat = {
  open: boolean
  farmerName: string | null
  farmName: string | null
  messages: ChatMessage[]
  myText: { status: string; detail: string | null } | null
  textSummary: TextSummary | null
}

const TEXT_COPY: Record<string, string> = {
  sent: "A text was sent to the phone number on your account. It says enough people joined and the farmer confirmed this pickup.",
  skipped_no_phone: "Add a phone number to your account to get the pickup text.",
  not_configured: "Pickup texts use Photon. This server does not have a Photon key yet, so no text was sent.",
  failed: "Photon could not send the pickup text.",
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "alice@demo.curbstand.app", name: "Alice Nguyen", role: "customer" },
  { email: "bob@demo.curbstand.app", name: "Bob Martinez", role: "customer" },
  { email: "kitchen@demo.curbstand.app", name: "Ballard Bistro", role: "customer" },
  { email: "farmer.sam@demo.curbstand.app", name: "Sam Okafor", role: "producer" },
  { email: "operator@demo.curbstand.app", name: "Curbstand Operator", role: "operator" },
]
const DEMO_PASSWORD = "password123"

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

async function request(token: string, path: string, init?: { method?: string; body?: unknown }) {
  const hasBody = init?.body !== undefined
  const response = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
  })
  const data = (await response.json()) as { error?: { message?: string }; message?: string }
  if (!response.ok) throw new ApiError(data.error?.message ?? data.message ?? "Request failed.", response.status)
  return data
}

function formatPacific(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso))
}

function textSummaryCopy(summary: TextSummary) {
  const parts = [
    summary.sent ? `${summary.sent} sent` : "",
    summary.notConfigured ? `${summary.notConfigured} waiting for a Photon key` : "",
    summary.skippedNoPhone ? `${summary.skippedNoPhone} with no phone number` : "",
    summary.failed ? `${summary.failed} failed` : "",
  ].filter(Boolean)
  return parts.length > 0 ? `Pickup texts: ${parts.join(", ")}.` : "Pickup texts have not been sent."
}

function completionLabel(status: string) {
  if (status === "checked_in_qr") return "Checked in · qr"
  if (status === "checked_in_manual") return "Checked in · manual"
  if (status === "no_show") return "No show"
  return "Not checked in"
}

export function App() {
  const [sessions, setSessions] = useState<Record<string, Session>>({})
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0]?.email ?? "")
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
  const [chat, setChat] = useState<Chat | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const [draft, setDraft] = useState("")
  const [chatReload, setChatReload] = useState(0)

  const session = email ? sessions[email] : undefined

  useEffect(() => {
    if (!email || sessions[email]) return
    let cancelled = false
    void request("", "/auth/login", { method: "POST", body: { email, password: DEMO_PASSWORD } })
      .then((body) => {
        if (cancelled) return
        const payload = body as { token: string; user: { id: string; name: string; email: string; role: string; isOperator: boolean } }
        setSessions((current) => ({
          ...current,
          [email]: {
            token: payload.token,
            userId: payload.user.id,
            name: payload.user.name,
            email: payload.user.email,
            role: payload.user.isOperator ? "operator" : payload.user.role,
            isOperator: payload.user.isOperator,
          },
        }))
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Sign-in failed.")
      })
    return () => {
      cancelled = true
    }
  }, [email, sessions])

  useEffect(() => {
    if (email && !session) return
    let cancelled = false
    async function load() {
      setLoadError(null)
      try {
        const token = session?.token ?? ""
        const listBody = (await request(token, "/group-buys")) as { groupBuys: GroupBuySummary[] }
        if (cancelled) return
        const list = listBody.groupBuys
        setGroupBuys(list)
        const id = groupBuyId || list[0]?.id || ""
        if (!groupBuyId && id) setGroupBuyId(id)
        if (!id) {
          setDetail(null)
          setLoadError("No open group buys. Seed the database with npm run db:seed.")
          return
        }
        if (!token) {
          setDetail(null)
          setBenchmark(null)
          setBenchmarkError(true)
          setLoadError("Sign in as a demo account to see deposits and check-in.")
          return
        }
        const detailBody = (await request(token, `/group-buys/${id}`)) as { groupBuy: Detail }
        if (cancelled) return
        const next = detailBody.groupBuy
        setDetail(next)
        const entries = await Promise.all(
          next.participants.map(async (participant) => {
            try {
              const tokenBody = (await request(token, `/group-buys/${id}/participants/${participant.id}/check-in-token`)) as { token?: string }
              return [participant.id, tokenBody.token ?? ""] as const
            } catch {
              return [participant.id, ""] as const
            }
          }),
        )
        if (!cancelled) setTokens(Object.fromEntries(entries.filter((entry) => entry[1])))
        try {
          const nextBenchmark = (await request(
            token,
            `/price-benchmarks?produceType=${encodeURIComponent(next.produceType.id)}&region=seattle-puget-sound`,
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
  }, [session, email, groupBuyId, reloadKey])

  useEffect(() => {
    if (!session || !groupBuyId) {
      setChat(null)
      return
    }
    const token = session.token
    let cancelled = false
    async function loadChat() {
      try {
        const body = (await request(token, `/group-buys/${groupBuyId}/messages`)) as { chat: Chat }
        if (!cancelled) {
          setChat(body.chat)
          setChatError(null)
        }
      } catch (error) {
        if (!cancelled) setChatError(error instanceof Error ? error.message : "Chat failed.")
      }
    }
    void loadChat()
    const timer = window.setInterval(() => void loadChat(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [session, groupBuyId, chatReload])

  async function sendChat(event: FormEvent) {
    event.preventDefault()
    if (!session || !groupBuyId || !draft.trim()) return
    setChatBusy(true)
    setChatError(null)
    try {
      await request(session.token, `/group-buys/${groupBuyId}/messages`, { method: "POST", body: { body: draft.trim() } })
      setDraft("")
      setChatReload((value) => value + 1)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message failed.")
    } finally {
      setChatBusy(false)
    }
  }

  function displayName(userId: string) {
    return (
      detail?.participants.find((participant) => participant.userId === userId)?.userName ??
      Object.values(sessions).find((actor) => actor.userId === userId)?.name ??
      userId
    )
  }

  async function act(path: string, body?: unknown, method = "POST") {
    if (!session) return
    setBusy(true)
    setActionError(null)
    try {
      await request(session.token, path, { method, body })
      setReloadKey((value) => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Request failed.")
    } finally {
      setBusy(false)
    }
  }

  const checkedIn = detail?.participants.filter((participant) => participant.completionStatus.startsWith("checked_in")).length ?? 0

  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">Curbstand · Task 4</p>
        <h1>Pickup fulfillment</h1>
        <p>Deposits, check-in, the farm chat, and the supermarket comparison read from the API. Nothing on this page moves money.</p>
      </header>

      <section className="toolbar card">
        <fieldset>
          <legend>Act as</legend>
          <div className="actor-row">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                aria-pressed={email === account.email}
                onClick={() => {
                  setActionError(null)
                  setEmail(account.email)
                }}
              >
                {account.name} · {sessions[account.email]?.role ?? account.role}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={email === ""}
              onClick={() => {
                setActionError(null)
                setEmail("")
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
                {groupBuy.produceType.name} · {STATUS_LABEL[groupBuy.status]}
              </option>
            ))}
            {groupBuyId && !groupBuys.some((groupBuy) => groupBuy.id === groupBuyId) ? (
              <option value={groupBuyId}>{detail?.produceType.name ?? "Current"} · {detail ? STATUS_LABEL[detail.status] : "saved"}</option>
            ) : null}
          </select>
        </label>
      </section>

      {loadError ? <p className="alert" role="alert">{loadError}</p> : null}
      {actionError ? <p className="alert" role="alert">{actionError}</p> : null}

      {detail ? (
        <section className="layout">
          <div className="stack">
            <article className="card">
              <p className="eyebrow">Group buy · {detail.produceType.name}</p>
              <h2>{STATUS_LABEL[detail.status]}</h2>
              <p>
                Pickup at {detail.pickupLocation.name}. Selected bid{" "}
                {detail.selectedBid ? `$${detail.selectedBid.pricePerLbUsd}/lb` : "not selected"}. {checkedIn} of{" "}
                {detail.participants.length} participants checked in.
              </p>
              <div className="actor-row">
                <button type="button" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/complete`)}>
                  Mark group buy completed
                </button>
                <button type="button" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/cancel`)}>
                  Cancel and mark refunds
                </button>
              </div>
            </article>

            <article className="card">
              <h2>Deposits</h2>
              <p className="disclaimer">{DEPOSIT_DISCLAIMER}</p>
              <ul className="people">
                {detail.participants.map((participant) => (
                  <li key={participant.id}>
                    <header>
                      <strong>{participant.userName}</strong>
                      <span>{participant.requestedLbs} lb · ${participant.depositAmountUsd}</span>
                    </header>
                    <p>{DEPOSIT_STATUS_COPY[participant.depositStatus]}</p>
                    <div className="actor-row">
                      <button type="button" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/participants/${participant.id}/deposit`, { status: "confirmed_manual" }, "PATCH")}>
                        Confirm manually
                      </button>
                      <button type="button" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/participants/${participant.id}/deposit`, { status: "refunded_manual" }, "PATCH")}>
                        Mark refunded manually
                      </button>
                      <button type="button" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/participants/${participant.id}/deposit`, { status: "forfeited_manual" }, "PATCH")}>
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
                      <strong>{participant.userName}</strong>
                      <span>{completionLabel(participant.completionStatus)}</span>
                    </header>
                    {tokens[participant.id] ? <p>QR payload <code>{tokens[participant.id]}</code></p> : <p>QR payload hidden for this actor.</p>}
                    <div className="actor-row">
                      <button type="button" disabled={busy || !tokens[participant.id]} onClick={() => void act(`/group-buys/${detail.id}/check-in`, { token: tokens[participant.id] })}>
                        Submit QR check-in
                      </button>
                      <button type="button" disabled={busy} onClick={() => void act(`/group-buys/${detail.id}/check-in`, { participantId: participant.id, method: "manual" })}>
                        Manual check-in
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="card">
              <h2>Chat with the farm</h2>
              {chat?.open ? (
                <p>
                  {chat.farmerName ?? "The farmer"}
                  {chat.farmName ? ` · ${chat.farmName}` : ""}. Customers and the farmer use this chat on the website.
                </p>
              ) : (
                <p>Chat opens after a farmer is selected.</p>
              )}
              {chat?.myText ? <p className="disclaimer">{TEXT_COPY[chat.myText.status] ?? chat.myText.detail}</p> : null}
              {chat?.textSummary ? <p>{textSummaryCopy(chat.textSummary)}</p> : null}
              {chatError ? <p className="alert" role="alert">{chatError}</p> : null}
              <ol className="chat-log">
                {chat?.messages.map((message) => (
                  <li key={message.id}>
                    <strong>{message.authorUserId === session?.userId ? "You" : message.authorName}</strong>
                    <span>{formatPacific(message.createdAt)}</span>
                    <p>{message.body}</p>
                  </li>
                ))}
              </ol>
              <form className="chat-form" onSubmit={(event) => void sendChat(event)}>
                <label>
                  Message
                  <input
                    value={draft}
                    maxLength={1000}
                    disabled={!chat?.open || chatBusy}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={!chat?.open || chatBusy || !draft.trim()}>
                  Send
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Event history</h2>
              <ol>
                {[...detail.events].reverse().map((event) => (
                  <li key={event.id}>
                    <strong>{event.eventType}</strong>
                    <span>{event.actorUserId ? displayName(event.actorUserId) : "System"}</span>
                    <span>{formatPacific(event.createdAt)}</span>
                    <code>{JSON.stringify(event.payload)}</code>
                  </li>
                ))}
              </ol>
            </article>
          </div>
          <MarketComparison
            produceType={detail.produceType.id}
            groupBuyPricePerLb={detail.selectedBid?.pricePerLbUsd ?? null}
            benchmark={benchmark}
            error={benchmarkError}
          />
        </section>
      ) : (
        <MarketComparison produceType="kale" groupBuyPricePerLb={null} benchmark={benchmark} error={benchmarkError} />
      )}
    </main>
  )
}
