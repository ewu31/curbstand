import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on the environment
}

const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;

if (!projectId || !projectSecret) {
  console.error("SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET are required.");
  process.exit(1);
}

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
});

console.log("Curbstand Spectrum iMessage agent is listening.");

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;
  const text = message.content.text;
  await space.responding(async () => {
    await space.send(`Photon Spectrum is connected. You said: ${text}`);
  });
}
