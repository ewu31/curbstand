/**
 * Photon 2.0 beta SMS client.
 * Docs: https://photon.codes/docs/beta/api-reference/messages/send-a-message
 * API: https://api.photon.codes/v1
 *
 * This is the beta platform (`pho_prj_` / `pho_sk_`), not the stable Spectrum SDK.
 */

const API_ORIGIN = "https://api.photon.codes";
const PROJECT_ID = /^pho_prj_[0-7][0-9a-hjkmnp-tv-z]{25}$/;
const USER_ID = /^pho_usr_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

export type PhotonSmsConfig = { apiKey: string; projectId: string; senderId: string };

/** Returns null unless a project key, project id, and SMS agent user id are all set. */
export function photonSmsConfig(env: NodeJS.ProcessEnv = process.env): PhotonSmsConfig | null {
  const apiKey = env.PHOTON_API_KEY?.trim() ?? "";
  const projectId = env.PHOTON_PROJECT_ID?.trim() ?? "";
  const senderId = env.PHOTON_SMS_SENDER_ID?.trim() ?? "";
  if (!apiKey || !PROJECT_ID.test(projectId) || !USER_ID.test(senderId)) return null;
  return { apiKey, projectId, senderId };
}

type FetchLike = typeof fetch;

export class PhotonSmsError extends Error {
  constructor(readonly status: number) {
    super(`Photon returned ${status}`);
  }
}

/**
 * Opens a direct SMS space between the project agent and one phone number, then sends plain text.
 * Idempotency keys make a retry reuse the same Photon message.
 */
export async function sendPhotonSms(
  config: PhotonSmsConfig,
  input: { toPhone: string; text: string; idempotencyKey: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ messageId: string }> {
  const humanId = await createOrGetUser(config, input.toPhone, fetchImpl);
  const spaceId = await createOrGetSpace(config, humanId, fetchImpl);
  return sendMessage(config, { ...input, spaceId }, fetchImpl);
}

async function createOrGetUser(config: PhotonSmsConfig, phone: string, fetchImpl: FetchLike): Promise<string> {
  const body = await photonRequest(config, fetchImpl, `/v1/projects/${config.projectId}/users`, `sms-user:${phone}`, {
    handle: phone,
    platform: "sms",
  });
  return readId(body, "pho_usr_");
}

async function createOrGetSpace(config: PhotonSmsConfig, humanId: string, fetchImpl: FetchLike): Promise<string> {
  const body = await photonRequest(
    config,
    fetchImpl,
    `/v1/projects/${config.projectId}/spaces`,
    `sms-space:${config.senderId}:${humanId}`,
    { participantIds: [config.senderId, humanId], platform: "sms" },
  );
  return readId(body, "pho_spc_");
}

async function sendMessage(
  config: PhotonSmsConfig,
  input: { toPhone: string; text: string; idempotencyKey: string; spaceId: string },
  fetchImpl: FetchLike,
): Promise<{ messageId: string }> {
  const body = await photonRequest(config, fetchImpl, `/v1/projects/${config.projectId}/messages`, input.idempotencyKey, {
    senderId: config.senderId,
    spaceId: input.spaceId,
    content: { type: "text", format: "plain", text: input.text },
  });
  return { messageId: readId(body, "pho_msg_") };
}

async function photonRequest(
  config: PhotonSmsConfig,
  fetchImpl: FetchLike,
  path: string,
  idempotencyKey: string,
  payload: unknown,
): Promise<unknown> {
  const response = await fetchImpl(`${API_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new PhotonSmsError(response.status);
  return text ? (JSON.parse(text) as unknown) : {};
}

function readId(body: unknown, prefix: string): string {
  if (body && typeof body === "object" && "id" in body && typeof body.id === "string" && body.id.startsWith(prefix)) {
    return body.id;
  }
  throw new PhotonSmsError(502);
}
