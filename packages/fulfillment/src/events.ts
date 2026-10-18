import type { EventRecord, EventType } from "./types"
import { EVENT_PAYLOAD_KEYS } from "./types"

export function eventPayload(type: EventType, fields: Record<string, string>): Record<string, string> {
  const allowed = EVENT_PAYLOAD_KEYS[type] as readonly string[]
  for (const key of Object.keys(fields)) {
    if (!allowed.includes(key)) {
      throw new Error(`Event field is not allowed: ${key}`)
    }
  }
  const payload: Record<string, string> = {}
  for (const key of allowed) {
    const value = fields[key]
    if (value === undefined) {
      throw new Error(`Event field is required: ${key}`)
    }
    payload[key] = value
  }
  return payload
}

export function buildEvent(input: {
  groupBuyId: string
  actorUserId: string
  eventType: EventType
  fields: Record<string, string>
  createdAt: string
}): EventRecord {
  return {
    id: `evt_${crypto.randomUUID()}`,
    groupBuyId: input.groupBuyId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    payload: eventPayload(input.eventType, input.fields),
    createdAt: input.createdAt,
  }
}
