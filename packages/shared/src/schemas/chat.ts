import { z } from "zod";

/** Body for POST /group-buys/:id/messages. Plain text only; no attachments. */
export const postChatMessageSchema = z.object({
  body: z.string().trim().min(1, "Message is empty").max(1000, "Message is too long"),
});

export type PostChatMessageInput = z.infer<typeof postChatMessageSchema>;
