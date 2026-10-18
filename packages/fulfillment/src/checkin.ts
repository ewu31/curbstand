import { buildEvent } from "./events"
import { FulfillmentError, requireActor } from "./errors"
import { sha256Hex } from "./hash"
import type { CheckInTokenStore, FulfillmentRepository } from "./repository"
import { toPublicParticipant, type PublicParticipant } from "./deposits"
import type { Actor, GroupBuyRecord, ParticipantRecord } from "./types"

function canIssueOrScan(actor: Actor, groupBuy: GroupBuyRecord, participant: ParticipantRecord): boolean {
  if (actor.role === "operator") return true
  if (actor.userId === participant.userId) return true
  if (actor.userId === groupBuy.createdBy) return true
  return groupBuy.selectedBid?.producerId === actor.userId
}

function canManualCheckIn(actor: Actor, groupBuy: GroupBuyRecord, participant: ParticipantRecord): boolean {
  if (actor.role === "operator") return true
  if (actor.userId === participant.userId) return true
  return groupBuy.selectedBid?.producerId === actor.userId
}

function canCompleteGroupBuy(actor: Actor, groupBuy: GroupBuyRecord): boolean {
  if (actor.role === "operator") return true
  if (actor.userId === groupBuy.createdBy) return true
  return groupBuy.selectedBid?.producerId === actor.userId
}

async function loadReadyGroupBuy(repo: FulfillmentRepository, groupBuyId: string): Promise<GroupBuyRecord> {
  const groupBuy = await repo.getGroupBuy(groupBuyId)
  if (!groupBuy) throw new FulfillmentError(404, "not_found", "Group buy not found.")
  return groupBuy
}

function assertDepositAllowsCheckIn(participant: ParticipantRecord): void {
  if (participant.depositStatus === "refunded_manual" || participant.depositStatus === "forfeited_manual") {
    throw new FulfillmentError(409, "conflict", "This participation was refunded or forfeited and cannot be checked in.")
  }
  if (!participant.depositStatus) {
    throw new FulfillmentError(409, "conflict", "Record a deposit intent before check-in.")
  }
}

async function markCheckedIn(
  repo: FulfillmentRepository,
  actor: Actor,
  participant: ParticipantRecord,
  method: "qr" | "manual",
  now: Date,
): Promise<{ participant: PublicParticipant; idempotent: boolean }> {
  if (participant.completionStatus === "completed") {
    return { participant: toPublicParticipant(participant), idempotent: true }
  }
  const completedAt = now.toISOString()
  const next: ParticipantRecord = {
    ...participant,
    completionStatus: "completed",
    completionMethod: method,
    completedAt,
    updatedAt: completedAt,
  }
  await repo.saveParticipant(next)
  await repo.appendEvent(
    buildEvent({
      groupBuyId: participant.groupBuyId,
      actorUserId: actor.userId,
      eventType: "participant_checked_in",
      createdAt: completedAt,
      fields: { participantId: participant.id, method },
    }),
  )
  return { participant: toPublicParticipant(next), idempotent: false }
}

export async function issueCheckInToken(
  repo: FulfillmentRepository,
  tokens: CheckInTokenStore,
  actor: Actor | null,
  participantId: string,
  now: Date,
): Promise<{ participantId: string; token: string }> {
  requireActor(actor)
  const participant = await repo.getParticipant(participantId)
  if (!participant) throw new FulfillmentError(404, "not_found", "Participant not found.")
  const groupBuy = await loadReadyGroupBuy(repo, participant.groupBuyId)
  if (!canIssueOrScan(actor, groupBuy, participant)) {
    throw new FulfillmentError(403, "forbidden", "You cannot issue a check-in code for this participation.")
  }
  if (groupBuy.status !== "ready_for_pickup") {
    throw new FulfillmentError(409, "conflict", "Check-in codes are available when the group buy is ready for pickup.")
  }
  if (participant.checkInTokenHash) {
    const existing = await tokens.get(participant.id)
    if (existing) return { participantId: participant.id, token: existing }
    throw new FulfillmentError(409, "conflict", "Check-in code was already issued.")
  }

  const token = crypto.randomUUID()
  const updatedAt = now.toISOString()
  await tokens.save(participant.id, token)
  await repo.saveParticipant({
    ...participant,
    checkInTokenHash: await sha256Hex(token),
    updatedAt,
  })
  return { participantId: participant.id, token }
}

export async function getCheckInToken(
  repo: FulfillmentRepository,
  tokens: CheckInTokenStore,
  actor: Actor | null,
  groupBuyId: string,
  participantId: string,
): Promise<{ participantId: string; token: string; method: "qr" }> {
  requireActor(actor)
  const groupBuy = await loadReadyGroupBuy(repo, groupBuyId)
  const participant = await repo.getParticipant(participantId)
  if (!participant || participant.groupBuyId !== groupBuyId) {
    throw new FulfillmentError(404, "not_found", "Participant not found.")
  }
  if (!canManualCheckIn(actor, groupBuy, participant)) {
    throw new FulfillmentError(403, "forbidden", "You cannot view this check-in code.")
  }
  const token = await tokens.get(participantId)
  if (!token) throw new FulfillmentError(404, "not_found", "Check-in code is not available.")
  return { participantId, token, method: "qr" }
}

export async function checkInWithQr(
  repo: FulfillmentRepository,
  actor: Actor | null,
  groupBuyId: string,
  token: string,
  now: Date,
): Promise<{ participant: PublicParticipant; idempotent: boolean }> {
  requireActor(actor)
  const groupBuy = await loadReadyGroupBuy(repo, groupBuyId)
  if (groupBuy.status !== "ready_for_pickup" && groupBuy.status !== "completed") {
    throw new FulfillmentError(409, "conflict", "QR check-in is available when the group buy is ready for pickup.")
  }
  const participant = await repo.findParticipantByTokenHash(groupBuyId, await sha256Hex(token))
  if (!participant) throw new FulfillmentError(404, "not_found", "Check-in code is not valid.")
  if (!canManualCheckIn(actor, groupBuy, participant)) {
    throw new FulfillmentError(403, "forbidden", "You cannot check in this participation.")
  }
  if (groupBuy.status === "completed" && participant.completionStatus !== "completed") {
    throw new FulfillmentError(409, "conflict", "This group buy is already completed.")
  }
  assertDepositAllowsCheckIn(participant)
  return markCheckedIn(repo, actor, participant, "qr", now)
}

export async function checkInManually(
  repo: FulfillmentRepository,
  actor: Actor | null,
  groupBuyId: string,
  participantId: string,
  now: Date,
): Promise<{ participant: PublicParticipant; idempotent: boolean }> {
  requireActor(actor)
  const groupBuy = await loadReadyGroupBuy(repo, groupBuyId)
  if (groupBuy.status !== "ready_for_pickup" && groupBuy.status !== "completed") {
    throw new FulfillmentError(409, "conflict", "Manual check-in is available when the group buy is ready for pickup.")
  }
  const participant = await repo.getParticipant(participantId)
  if (!participant || participant.groupBuyId !== groupBuyId) {
    throw new FulfillmentError(404, "not_found", "Participant not found.")
  }
  if (!canManualCheckIn(actor, groupBuy, participant)) {
    throw new FulfillmentError(403, "forbidden", "Manual check-in is limited to the customer, the selected producer, or an operator.")
  }
  if (groupBuy.status === "completed" && participant.completionStatus !== "completed") {
    throw new FulfillmentError(409, "conflict", "This group buy is already completed.")
  }
  assertDepositAllowsCheckIn(participant)
  return markCheckedIn(repo, actor, participant, "manual", now)
}

export async function completeGroupBuy(
  repo: FulfillmentRepository,
  actor: Actor | null,
  groupBuyId: string,
  now: Date,
): Promise<{ id: string; status: "completed"; updatedAt: string; idempotent: boolean }> {
  requireActor(actor)
  const groupBuy = await loadReadyGroupBuy(repo, groupBuyId)
  if (!canCompleteGroupBuy(actor, groupBuy)) {
    throw new FulfillmentError(403, "forbidden", "Only the owner, selected producer, or an operator can complete this group buy.")
  }
  if (groupBuy.status === "completed") {
    return { id: groupBuy.id, status: "completed", updatedAt: groupBuy.updatedAt, idempotent: true }
  }
  if (groupBuy.status !== "ready_for_pickup") {
    throw new FulfillmentError(409, "conflict", "Complete the group buy after it is ready for pickup and everyone is checked in.")
  }

  const participants = await repo.listParticipants(groupBuyId)
  const active = participants.filter(
    (participant) => participant.depositStatus === "pending" || participant.depositStatus === "confirmed_manual",
  )
  if (active.length === 0 || active.some((participant) => participant.completionStatus !== "completed")) {
    throw new FulfillmentError(409, "conflict", "Every active participant must be checked in before completion.")
  }

  const updatedAt = now.toISOString()
  await repo.saveGroupBuy({ ...groupBuy, status: "completed", updatedAt })
  await repo.appendEvent(
    buildEvent({
      groupBuyId,
      actorUserId: actor.userId,
      eventType: "group_buy_completed",
      createdAt: updatedAt,
      fields: { status: "completed" },
    }),
  )
  return { id: groupBuy.id, status: "completed", updatedAt, idempotent: false }
}
