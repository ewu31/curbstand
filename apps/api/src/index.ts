import { prisma } from "@curbstand/db";
import { createApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 8787);
const app = createApp(prisma);
await app.listen({ port, host: "0.0.0.0" });
