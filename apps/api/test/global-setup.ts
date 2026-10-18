import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const TEST_DB = new URL("../prisma/test.db", import.meta.url);

export default function setup() {
  // Throwaway SQLite file, rebuilt from migrations on every run. Never points at dev.db.
  rmSync(TEST_DB, { force: true });
  rmSync(new URL("../prisma/test.db-journal", import.meta.url), { force: true });
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
