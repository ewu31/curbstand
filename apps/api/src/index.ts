import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const path of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

const { prisma } = await import("@curbstand/db");
const { createApp } = await import("./app.js");

const port = Number(process.env.API_PORT ?? 8787);
const app = createApp(prisma);
await app.listen({ port, host: "0.0.0.0" });
