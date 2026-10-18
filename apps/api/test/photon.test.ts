import { describe, expect, it } from "vitest";
import { photonSmsConfig, sendPhotonSms } from "../src/photon";

describe("Photon 2.0 SMS", () => {
  it("stays unconfigured until the project id and SMS sender id are set", () => {
    expect(photonSmsConfig({ PHOTON_API_KEY: "pho_sk_test" })).toBeNull();
    expect(
      photonSmsConfig({
        PHOTON_API_KEY: "pho_sk_test",
        PHOTON_PROJECT_ID: "pho_prj_00000000000000000000000001",
        PHOTON_SMS_SENDER_ID: "pho_usr_00000000000000000000000001",
      }),
    ).toMatchObject({ senderId: "pho_usr_00000000000000000000000001" });
  });

  it("creates the SMS user and space, then sends plain text", async () => {
    const calls: Array<{ url: string; body: unknown; key: string | null }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), key: headers.get("idempotency-key") });
      const path = String(url).split("/").at(-1);
      const id =
        path === "users"
          ? "pho_usr_00000000000000000000000002"
          : path === "spaces"
            ? "pho_spc_00000000000000000000000001"
            : "pho_msg_00000000000000000000000001";
      return new Response(JSON.stringify({ id }), { status: 202 });
    };

    const sent = await sendPhotonSms(
      {
        apiKey: "pho_sk_test",
        projectId: "pho_prj_00000000000000000000000001",
        senderId: "pho_usr_00000000000000000000000001",
      },
      { toPhone: "+12065550111", text: "Pickup is confirmed", idempotencyKey: "pickup-text:gb:user" },
      fetchImpl,
    );

    expect(sent.messageId).toBe("pho_msg_00000000000000000000000001");
    expect(calls.map((call) => call.body)).toEqual([
      { handle: "+12065550111", platform: "sms" },
      {
        participantIds: ["pho_usr_00000000000000000000000001", "pho_usr_00000000000000000000000002"],
        platform: "sms",
      },
      {
        senderId: "pho_usr_00000000000000000000000001",
        spaceId: "pho_spc_00000000000000000000000001",
        content: { type: "text", format: "plain", text: "Pickup is confirmed" },
      },
    ]);
    expect(calls[2]?.key).toBe("pickup-text:gb:user");
    expect(calls.every((call) => call.url.startsWith("https://api.photon.codes/v1/projects/"))).toBe(true);
  });
});
