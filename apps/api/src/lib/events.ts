import type { EventType } from "@curbstand/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Appends a group-buy event. Payloads are for the public history: ids, statuses,
 * quantities, and reasons only — never contact details, tokens, or credentials.
 */
export function recordEvent(
  db: Db,
  event: { groupBuyId: string; actorUserId: string | null; eventType: EventType; payload?: Record<string, unknown> },
) {
  return db.event.create({
    data: {
      groupBuyId: event.groupBuyId,
      actorUserId: event.actorUserId,
      eventType: event.eventType,
      payload: JSON.stringify(event.payload ?? {}),
    },
  });
}
