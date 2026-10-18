import { recordDepositIntent, changeDepositStatus } from "./deposits"
import { issueCheckInToken } from "./checkin"
import { MemoryFulfillmentRepository, MemoryTokenStore } from "./memory"
import type { CheckInTokenStore, FulfillmentRepository } from "./repository"
import { REGION, type Actor, type BaselineRecord, type GroupBuyRecord, type ParticipantRecord } from "./types"

export const GROUP_BUY_ID = "gb_kale"
export const PARTICIPANTS = {
  bob: "part_bob",
  cara: "part_cara",
} as const

export const DEMO_ACTORS = {
  alice: { userId: "user_alice", role: "customer" },
  bob: { userId: "user_bob", role: "customer" },
  cara: { userId: "user_cara", role: "customer" },
  dana: { userId: "user_dana", role: "producer" },
  erin: { userId: "user_erin", role: "customer" },
  operator: { userId: "user_operator", role: "operator" },
} as const satisfies Record<string, Actor>

export const DEMO_ACTOR_NAMES: Record<string, string> = {
  user_alice: "Alice Chen",
  user_bob: "Bob Alvarez",
  user_cara: "Cara Singh",
  user_dana: "Dana Ortiz",
  user_erin: "Erin Brooks",
  user_operator: "Pickup operator",
}

const BASELINES: Array<[string, string]> = [
  ["apples", "0.35"],
  ["blueberries", "1.80"],
  ["carrots", "0.25"],
  ["kale", "0.40"],
  ["lettuce", "0.30"],
  ["potatoes", "0.18"],
  ["strawberries", "1.10"],
  ["tomatoes", "0.55"],
]

export type DemoScenario = "ready_for_pickup" | "matched"

function shell(id: string, userId: string, requestedLbs: string, at: string): ParticipantRecord {
  return {
    id,
    groupBuyId: GROUP_BUY_ID,
    userId,
    requestedLbs,
    depositAmount: null,
    depositStatus: null,
    completionStatus: "pending",
    completionMethod: null,
    completedAt: null,
    checkInTokenHash: null,
    createdAt: at,
    updatedAt: at,
  }
}

export async function seedScenario(
  repo: FulfillmentRepository,
  tokens: CheckInTokenStore,
  scenario: DemoScenario,
  now: Date,
): Promise<void> {
  const at = now.toISOString()
  const groupBuy: GroupBuyRecord = {
    id: GROUP_BUY_ID,
    produceType: "kale",
    region: REGION,
    status: scenario === "matched" ? "matched" : "ready_for_pickup",
    createdBy: DEMO_ACTORS.alice.userId,
    selectedBid: { id: "bid_dana", producerId: DEMO_ACTORS.dana.userId, pricePerLb: "1.10" },
    pickupLocationLabel: "Northgate Community Center lot",
    updatedAt: at,
  }
  await repo.saveGroupBuy(groupBuy)
  for (const [produceType, baselinePerLb] of BASELINES) {
    const baseline: BaselineRecord = {
      produceType,
      region: REGION,
      currency: "USD",
      baselinePerLb,
      updatedAt: at,
    }
    await repo.saveBaseline(baseline)
  }
  await repo.saveParticipant(shell(PARTICIPANTS.bob, DEMO_ACTORS.bob.userId, "20", at))
  await repo.saveParticipant(shell(PARTICIPANTS.cara, DEMO_ACTORS.cara.userId, "30", at))
  await recordDepositIntent(repo, DEMO_ACTORS.bob, PARTICIPANTS.bob, now)
  await recordDepositIntent(repo, DEMO_ACTORS.cara, PARTICIPANTS.cara, now)
  if (scenario === "matched") {
    await changeDepositStatus(repo, DEMO_ACTORS.alice, GROUP_BUY_ID, PARTICIPANTS.bob, "confirmed_manual", now)
    return
  }
  await issueCheckInToken(repo, tokens, DEMO_ACTORS.operator, PARTICIPANTS.bob, now)
  await issueCheckInToken(repo, tokens, DEMO_ACTORS.operator, PARTICIPANTS.cara, now)
}

export function actorFromDemoHeader(header: string | string[] | undefined): Actor | null {
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return null
  return Object.values(DEMO_ACTORS).find((actor) => actor.userId === value) ?? null
}

export function createSeededRepository(scenario: DemoScenario, now: Date) {
  const repo = new MemoryFulfillmentRepository()
  const tokens = new MemoryTokenStore()
  return {
    repo,
    tokens,
    ready: seedScenario(repo, tokens, scenario, now),
  }
}
