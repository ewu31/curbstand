import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret-at-least-16-chars",
      // Suites sign up many users from one IP; the rate-limit test builds its own app.
      AUTH_RATE_LIMIT_MAX: "10000",
    },
    globalSetup: ["./test/global-setup.ts"],
    // One SQLite file shared by all tests.
    fileParallelism: false,
  },
});
