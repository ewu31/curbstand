import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export { schema };

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const client = postgres(databaseUrl, {
    ssl: process.env.DATABASE_SSL === "true" ? "require" : undefined,
  });
  return { db: drizzle(client, { schema }), client };
}

export type Database = ReturnType<typeof createDb>["db"];
