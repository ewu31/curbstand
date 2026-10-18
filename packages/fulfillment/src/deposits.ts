import { buildEvent } from "./events"
import { FulfillmentError, requireActor } from "./errors"
import type { FulfillmentRepository } from "./repository"
import {
  DEPOSIT_AMOUNT_USD,
  DEPOSIT_DISCLAIMER,
  DEPOSIT_STATUS_COPY,
  type Actor,
  type DepositStatus,
  type GroupBuyRecord,
  type ManualDepositStatus,
  type ParticipantRecord,
} from "./types"

const NEXT_STATUS: Record<DepositStatus, readonly ManualDepositStatus[]> = {
  pending: ["confirmed_manual", "refunded_manual", "forfeited_manual"],
  confirmed_manual: ["refunded_manual", "forfeited_manual"],
  refunded_manual: [],
  forfeited_manual: [],
}

const DEPOSIT_EVENT = {
  confirmed_manual: "deposit_confirmed_manual",
  refunded_manual: "deposit_refunded_manual",
  forfeited_manual: "deposit_forfeited_manual",
} as const

export type PublicParticipant = {
  id: string
  groupBuyId: string
  userId: string
  requestedLbs: string
  quantityUnit: "lb"
  depositAmount: string | null
  currency: "USD"
  depositStatus: DepositStatus | null
  depositStatusLabel: string | null
  paymentProcessed: false
  completionStatus: ParticipantRecord["completionStatus"]
  completionMethod: ParticipantRecord["completionMethod"]
  completedAt: string | null
  updatedAt: string
}

export function toPublicParticipant(participant: ParticipantRecord): PublicParticipant {
  return {
    id: participant.id,
    groupBuyId: participant.groupBuyId,
    userId: participant.userId,
    requestedLbs: participant.requestedLbs,
    quantityUnit: "lb",
    depositAmount: participant.depositAmount,
    currency: "USD",
    depositStatus: participant.depositStatus,
    depositStatusLabel: participant.depositStatus ? DEPOSIT_STATUS_COPY[participant.depositStatus] : null,
    paymentProcessed: false,
    completionStatus: participant.completionStatus,
    completionMethod: participant.completionMethod,
    completedAt: participant.completedAt,
    updatedAt: participant.updatedAt,
  }
}

function canManageDeposits(actor: Actor, groupBuy: GroupBuyRecord): boolean {
  return actor.role === "operator" || actor.userId === groupBuy.createdBy
}

export function canViewGroupBuy(actor: Actor, groupBuy: GroupBuyRecord, participants: ParticipantRecord[]): boolean {
  if (actor.role === "operator") return true
  if (actor.userId === groupBuy.createdBy) return true
  if (groupBuy.selectedBid?.producerId === actor.userId) return true
  return participants.some((participant) => participant.userId === actor.userId)
}

async function loadGroupBuy(repo: FulfillmentRepository, groupBuyId: string): Promise<GroupBuyRecord> {
  const groupBuy = await repo.getGroupBuy(groupBuyId)
  if (!groupBuy) {
    throw new FulfillmentError(404, "not_found", "Group buy not found.")
  }
  return groupBuy
}

export async function recordDepositIntent(
  repo: FulfillmentRepository,
  actor: Actor | null,
  participantId: string,
  now: Date,
): Promise<PublicParticipant> {
  requireActor(actor)
  const participant = await repo.getParticipant(participantId)
  if (!participant) {
    throw new FulfillmentError(404, "not_found", "Participant not found.")
  }
  if (actor.role !== "operator" && actor.userId !== participant.userId) {
    throw new FulfillmentError(403, "forbidden", "Only the joining customer can record this deposit intent.")
  }
  if (participant.depositStatus) {
    return toPublicParticipant(participant)
  }

  const updatedAt = now.toISOString()
  const next: ParticipantRecord = {
    ...participant,
    depositAmount: DEPOSIT_AMOUNT_USD,
    depositStatus: "pending",
    updatedAt,
  }
  await repo.saveParticipant(next)
  await repo.appendEvent(
    buildEvent({
      groupBuyId: participant.groupBuyId,
      actorUserId: actor.userId,
      eventType: "deposit_intent_recorded",
      createdAt: updatedAt,
      fields: {
        participantId: participant.id,
        depositStatus: "pending",
        depositAmount: DEPOSIT_AMOUNT_USD,
        currency: "USD",
      },
    }),
  )
  return toPublicParticipant(next)
}

export async function changeDepositStatus(
  repo: FulfillmentRepository,
  actor: Actor | null,
  groupBuyId: string,
  participantId: string,
  status: ManualDepositStatus,
  now: Date,
): Promise<{ participant: PublicParticipant; idempotent: boolean; disclaimer: string; paymentProcessed: false }> {
  requireActor(actor)
  const groupBuy = await loadGroupBuy(repo, groupBuyId)
  const participant = await repo.getParticipant(participantId)
  if (!participant || participant.groupBuyId !== groupBuyId) {
    throw new FulfillmentError(404, "not_found", "Participant not found.")
  }
  if (!canManageDeposits(actor, groupBuy)) {
    throw new FulfillmentError(403, "forbidden", "Only the group-buy owner or an operator can change a deposit.")
  }
  if (!participant.depositStatus || !participant.depositAmount) {
    throw new FulfillmentError(409, "conflict", "Record a deposit intent before changing its status.")
  }
  if (participant.depositStatus === status) {
    return {
      participant: toPublicParticipant(participant),
      idempotent: true,
      disclaimer: DEPOSIT_DISCLAIMER,
      paymentProcessed: false,
    }
  }
  if (groupBuy.status === "cancelled" || groupBuy.status === "completed") {
    throw new FulfillmentError(409, "conflict", "This group buy no longer accepts deposit changes.")
  }
  if (!NEXT_STATUS[participant.depositStatus].includes(status)) {
    throw new FulfillmentError(409, "conflict", `Cannot change a ${participant.depositStatus} deposit to ${status}.`)
  }

  const updatedAt = now.toISOString()
  const next: ParticipantRecord = { ...participant, depositStatus: status, updatedAt }
  await repo.saveParticipant(next)
  await repo.appendEvent(
    buildEvent({
      groupBuyId,
      actorUserId: actor.userId,
      eventType: DEPOSIT_EVENT[status],
      createdAt: updatedAt,
      fields: {
        participantId,
        depositStatus: status,
        depositAmount: participant.depositAmount,
        currency: "USD",
      },
    }),
  )
  return {
    participant: toPublicParticipant(next),
    idempotent: false,
    disclaimer: DEPOSIT_DISCLAIMER,
    paymentProcessed: false,
  }
}

export async function refundConfirmedDepositsOnCancel(
  repo: FulfillmentRepository,
  actor: Actor | null,
  groupBuyId: string,
  now: Date,
): Promise<{ status: "cancelled"; idempotent: boolean; disclaimer: string; paymentProcessed: false }> {
  requireActor(actor)
  const groupBuy = await loadGroupBuy(repo, groupBuyId)
  if (!canManageDeposits(actor, groupBuy)) {
    throw new FulfillmentError(403, "forbidden", "Only the group-buy owner or an operator can cancel this group buy.")
  }
  if (groupBuy.status === "cancelled") {
    return { status: "cancelled", idempotent: true, disclaimer: DEPOSIT_DISCLAIMER, paymentProcessed: false }
  }
  if (groupBuy.status !== "open" && groupBuy.status !== "funding" && groupBuy.status !== "matched") {
    throw new FulfillmentError(409, "conflict", "Only an open, funding, or matched group buy can be cancelled.")
  }

  const updatedAt = now.toISOString()
  const participants = await repo.listParticipants(groupBuyId)
  for (const participant of participants) {
    if (participant.depositStatus !== "confirmed_manual" || !participant.depositAmount) continue
    const next: ParticipantRecord = { ...participant, depositStatus: "refunded_manual", updatedAt }
    await repo.saveParticipant(next)
    await repo.appendEvent(
      buildEvent({
        groupBuyId,
        actorUserId: actor.userId,
        eventType: "deposit_refunded_manual",
        createdAt: updatedAt,
        fields: {
          participantId: participant.id,
          depositStatus: "refunded_manual",
          depositAmount: participant.depositAmount,
          currency: "USD",
        },
      }),
    )
  }

  await repo.saveGroupBuy({ ...groupBuy, status: "cancelled", updatedAt })
  await repo.appendEvent(
    buildEvent({
      groupBuyId,
      actorUserId: actor.userId,
      eventType: "group_buy_cancelled",
      createdAt: updatedAt,
      fields: { status: "cancelled" },
    }),
  )
  return { status: "cancelled", idempotent: false, disclaimer: DEPOSIT_DISCLAIMER, paymentProcessed: false }
}
