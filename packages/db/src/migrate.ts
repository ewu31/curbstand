import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index.js";

const { db, client } = createDb();
await migrate(db, { migrationsFolder: "./drizzle" });
await client.end();
