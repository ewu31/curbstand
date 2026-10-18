import { serve } from "@hono/node-server";
import { createDb } from "@curbstand/db";
import { createApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 8787);
const { db } = createDb();
serve({ fetch: createApp(db).fetch, port });
console.log(`Curbstand API listening on http://localhost:${port}`);
