import { type PickupTextStatus } from "@curbstand/shared";
import { prisma } from "./lib/db";
import { recordEvent } from "./lib/events";
import { PhotonSmsError, photonSmsConfig, sendPhotonSms } from "./photon";

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Texts each customer once the group buy is funded and the selected farmer has
 * confirmed the pickup. Safe to call again: each customer is recorded once.
 * A missing Photon key records `not_configured` and does not fail the caller.
 */
export async function ensurePickupTexts(groupBuyId: string, actorUserId: string | null): Promise<void> {
  const groupBuy = await prisma.groupBuy.findUnique({
    where: { id: groupBuyId },
    include: {
      produceType: { select: { name: true } },
      pickupLocation: { select: { name: true } },
      selectedBid: { select: { producerId: true, producer: { select: { name: true } } } },
      participants: { select: { userId: true } },
      createdBy: { select: { id: true } },
    },
  });
  if (!groupBuy?.selectedBid) return;
  if (groupBuy.status !== "ready_for_pickup" && groupBuy.status !== "completed") return;

  const recipientIds = [...new Set([groupBuy.createdBy.id, ...groupBuy.participants.map((row) => row.userId)])].filter(
    (id) => id !== groupBuy.selectedBid?.producerId,
  );
  if (recipientIds.length === 0) return;

  const already = await prisma.pickupText.findMany({ where: { groupBuyId }, select: { userId: true } });
  const done = new Set(already.map((row) => row.userId));
  const pendingIds = recipientIds.filter((id) => !done.has(id));
  if (pendingIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: pendingIds } },
    select: { id: true, phone: true },
  });
  const text = pickupText({
    produce: groupBuy.produceType.name,
    farmer: groupBuy.selectedBid.producer.name,
    location: groupBuy.pickupLocation.name,
    start: groupBuy.pickupWindowStart,
    end: groupBuy.pickupWindowEnd,
  });
  const photon = photonSmsConfig();

  for (const user of users) {
    const outcome = await deliver(photon, user.phone, text, `pickup-text:${groupBuyId}:${user.id}`);
    await prisma.pickupText.create({
      data: {
        groupBuyId,
        userId: user.id,
        status: outcome.status,
        photonMessageId: outcome.messageId,
        detail: outcome.detail,
      },
    }).catch((error: { code?: string }) => {
      if (error.code !== "P2002") throw error;
    });
  }

  const recorded = await prisma.event.findFirst({
    where: { groupBuyId, eventType: "pickup.text_notified" },
    select: { id: true },
  });
  if (!recorded) {
    const rows = await prisma.pickupText.findMany({ where: { groupBuyId }, select: { status: true } });
    if (rows.length > 0) {
      await recordEvent(prisma, {
        groupBuyId,
        actorUserId,
        eventType: "pickup.text_notified",
        payload: countStatuses(rows.map((row) => row.status as PickupTextStatus)),
      });
    }
  }
}

function pickupText(input: { produce: string; farmer: string; location: string; start: Date; end: Date }): string {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(input.start);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });
  const when = `${date}, ${time.format(input.start)}–${time.format(input.end)} PT`;
  return `Curbstand: Enough people joined the ${input.produce} group buy. ${input.farmer} confirmed pickup at ${input.location} on ${when}. Continue on the Curbstand website chat.`;
}

async function deliver(
  photon: ReturnType<typeof photonSmsConfig>,
  phone: string | null,
  text: string,
  idempotencyKey: string,
): Promise<{ status: PickupTextStatus; messageId: string | null; detail: string | null }> {
  if (!phone || !E164.test(phone)) {
    return { status: "skipped_no_phone", messageId: null, detail: "No phone number on the account." };
  }
  if (!photon) {
    return { status: "not_configured", messageId: null, detail: "Photon is not configured on this server." };
  }
  try {
    const sent = await sendPhotonSms(photon, { toPhone: phone, text, idempotencyKey });
    return { status: "sent", messageId: sent.messageId, detail: null };
  } catch (error) {
    const status = error instanceof PhotonSmsError ? error.status : 0;
    return { status: "failed", messageId: null, detail: status ? `Photon returned ${status}.` : "Photon could not send the text." };
  }
}

function countStatuses(statuses: PickupTextStatus[]) {
  return {
    sent: statuses.filter((status) => status === "sent").length,
    skippedNoPhone: statuses.filter((status) => status === "skipped_no_phone").length,
    notConfigured: statuses.filter((status) => status === "not_configured").length,
    failed: statuses.filter((status) => status === "failed").length,
  };
}
