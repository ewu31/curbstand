export const REGION = "seattle-puget-sound" as const
export type Region = typeof REGION

export const DEPOSIT_STATUSES = [
  "pending",
  "confirmed_manual",
  "refunded_manual",
  "forfeited_manual",
] as const
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number]

export const MANUAL_DEPOSIT_STATUSES = [
  "confirmed_manual",
  "refunded_manual",
  "forfeited_manual",
] as const
export type ManualDepositStatus = (typeof MANUAL_DEPOSIT_STATUSES)[number]

export const GROUP_BUY_STATUSES = [
  "open",
  "funding",
  "matched",
  "ready_for_pickup",
  "completed",
  "cancelled",
] as const
export type GroupBuyStatus = (typeof GROUP_BUY_STATUSES)[number]

export type ActorRole = "customer" | "producer" | "operator"

export type Actor = {
  userId: string
  role: ActorRole
}

export type SelectedBid = {
  id: string
  producerId: string
  pricePerLb: string
}

export type GroupBuyRecord = {
  id: string
  produceType: string
  region: string
  status: GroupBuyStatus
  createdBy: string
  selectedBid: SelectedBid | null
  pickupLocationLabel: string
  updatedAt: string
}

export type CompletionMethod = "qr" | "manual"
export type CompletionStatus = "pending" | "completed"

export type ParticipantRecord = {
  id: string
  groupBuyId: string
  userId: string
  requestedLbs: string
  depositAmount: string | null
  depositStatus: DepositStatus | null
  completionStatus: CompletionStatus
  completionMethod: CompletionMethod | null
  completedAt: string | null
  checkInTokenHash: string | null
  createdAt: string
  updatedAt: string
}

export const EVENT_TYPES = [
  "deposit_intent_recorded",
  "deposit_confirmed_manual",
  "deposit_refunded_manual",
  "deposit_forfeited_manual",
  "participant_checked_in",
  "group_buy_completed",
  "group_buy_cancelled",
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_PAYLOAD_KEYS = {
  deposit_intent_recorded: ["participantId", "depositStatus", "depositAmount", "currency"],
  deposit_confirmed_manual: ["participantId", "depositStatus", "depositAmount", "currency"],
  deposit_refunded_manual: ["participantId", "depositStatus", "depositAmount", "currency"],
  deposit_forfeited_manual: ["participantId", "depositStatus", "depositAmount", "currency"],
  participant_checked_in: ["participantId", "method"],
  group_buy_completed: ["status"],
  group_buy_cancelled: ["status"],
} as const satisfies Record<EventType, readonly string[]>

export type EventRecord = {
  id: string
  groupBuyId: string
  actorUserId: string
  eventType: EventType
  payload: Record<string, string>
  createdAt: string
}

export type BenchmarkSource = "gemini" | "demo_sample"

export type RetailEstimate = {
  source: BenchmarkSource
  retailLowPerLb: string
  retailHighPerLb: string
  model: string
  promptVersion: string
  promptHash: string
}

export type BenchmarkRecord = {
  id: string
  produceType: string
  region: Region
  currency: "USD"
  unit: "lb"
  retailLow: string
  retailHigh: string
  source: BenchmarkSource
  model: string
  promptVersion: string
  promptHash: string
  responseJson: {
    retailLowPerLb: string
    retailHighPerLb: string
    currency: "USD"
    unit: "lb"
  }
  retrievedAt: string
  expiresAt: string
}

export type BaselineRecord = {
  produceType: string
  region: Region
  currency: "USD"
  baselinePerLb: string
  updatedAt: string
}

export type EstimateMode = "gemini" | "demo_sample" | "off"

export const DEPOSIT_AMOUNT_USD = "5.00"
export const PRICE_BENCHMARK_TTL_SECONDS = 6 * 60 * 60

export const DEPOSIT_STATUS_COPY: Record<DepositStatus, string> = {
  pending: "Pending manual confirmation. No money has been collected.",
  confirmed_manual: "Manually confirmed. No payment was processed.",
  refunded_manual: "Marked refunded manually. No money was moved.",
  forfeited_manual: "Marked forfeited manually. No money was moved.",
}

export const DEPOSIT_DISCLAIMER =
  "Deposit statuses are manual demo records. Curbstand did not collect, refund, or move money."
