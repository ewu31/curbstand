import { postChatMessageSchema, type PickupTextStatus } from "@curbstand/shared";
import type { FastifyPluginAsync } from "fastify";
import { authUser, requireAuth } from "../auth/guards";
import { prisma } from "../lib/db";
import { conflict, forbidden, notFound } from "../lib/errors";
import { ensurePickupTexts } from "../pickup-text";

type IdParams = { Params: { id: string } };

const chatInclude = {
  produceType: { select: { name: true } },
  selectedBid: { select: { producerId: true, producer: { select: { name: true, producerProfile: { select: { farmName: true } } } } } },
  participants: { select: { userId: true } },
} as const;

const routes: FastifyPluginAsync = async (app) => {
  app.get<IdParams>("/group-buys/:id/messages", { preHandler: requireAuth }, async (request) => {
    const user = authUser(request);
    const groupBuy = await loadChatGroupBuy(request.params.id);
    const access = chatAccess(user, groupBuy);
    if (!access) throw forbidden("Only customers on this group buy and the selected farmer can read the chat.");
    if (groupBuy.status === "ready_for_pickup" || groupBuy.status === "completed") {
      await ensurePickupTexts(groupBuy.id, user.id);
    }
    return { chat: await serializeChat(groupBuy, user.id, access) };
  });

  app.post<IdParams>("/group-buys/:id/messages", { preHandler: requireAuth }, async (request, reply) => {
    const user = authUser(request);
    const { body } = postChatMessageSchema.parse(request.body);
    const groupBuy = await loadChatGroupBuy(request.params.id);
    const access = chatAccess(user, groupBuy);
    if (access !== "write") throw forbidden("Only customers on this group buy and the selected farmer can send a message.");
    if (!groupBuy.selectedBid) throw conflict("Chat opens after a farmer is selected.");

    const message = await prisma.chatMessage.create({
      data: { groupBuyId: groupBuy.id, authorUserId: user.id, body },
      include: { author: { select: { name: true } } },
    });
    reply.status(201);
    return {
      message: {
        id: message.id,
        authorUserId: message.authorUserId,
        authorName: message.author.name,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    };
  });
};

async function loadChatGroupBuy(id: string) {
  const groupBuy = await prisma.groupBuy.findUnique({ where: { id }, include: chatInclude });
  if (!groupBuy) throw notFound("Group buy not found");
  return groupBuy;
}

function chatAccess(
  user: { id: string; isOperator: boolean },
  groupBuy: { createdById: string; selectedBid: { producerId: string } | null; participants: { userId: string }[] },
): "write" | "read" | null {
  const involved =
    user.id === groupBuy.createdById ||
    user.id === groupBuy.selectedBid?.producerId ||
    groupBuy.participants.some((participant) => participant.userId === user.id);
  if (involved) return "write";
  if (user.isOperator) return "read";
  return null;
}

async function serializeChat(
  groupBuy: {
    id: string;
    createdById: string;
    status: string;
    selectedBid: { producerId: string; producer: { name: string; producerProfile: { farmName: string } | null } } | null;
  },
  viewerId: string,
  access: "write" | "read",
) {
  const [messages, texts] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { groupBuyId: groupBuy.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true } } },
    }),
    prisma.pickupText.findMany({ where: { groupBuyId: groupBuy.id }, select: { userId: true, status: true, detail: true } }),
  ]);
  const mine = texts.find((row) => row.userId === viewerId);
  const canSeeSummary = access === "read" || viewerId === groupBuy.createdById || viewerId === groupBuy.selectedBid?.producerId;
  return {
    open: Boolean(groupBuy.selectedBid),
    farmerName: groupBuy.selectedBid?.producer.name ?? null,
    farmName: groupBuy.selectedBid?.producer.producerProfile?.farmName ?? null,
    messages: messages.map((message) => ({
      id: message.id,
      authorUserId: message.authorUserId,
      authorName: message.author.name,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
    myText: mine ? { status: mine.status as PickupTextStatus, detail: mine.detail } : null,
    textSummary: canSeeSummary && texts.length > 0 ? summarize(texts.map((row) => row.status as PickupTextStatus)) : null,
  };
}

function summarize(statuses: PickupTextStatus[]) {
  return {
    sent: statuses.filter((status) => status === "sent").length,
    skippedNoPhone: statuses.filter((status) => status === "skipped_no_phone").length,
    notConfigured: statuses.filter((status) => status === "not_configured").length,
    failed: statuses.filter((status) => status === "failed").length,
  };
}

export default routes;
