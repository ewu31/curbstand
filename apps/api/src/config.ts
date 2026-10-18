import { z } from "zod";
import { parseFixed2 } from "@curbstand/shared";

try {
  process.loadEnvFile(); // apps/api/.env, if present; never overrides existing env vars
} catch {
  // no .env file; rely on the environment
}

const DEV_JWT_SECRET = "dev-insecure-secret-do-not-use-in-production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  DEPOSIT_AMOUNT_USD: z.string().default("5.00"),
  CORS_ORIGINS: z.string().default("http://localhost:4321,http://127.0.0.1:4321,http://localhost:5173"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(64 * 1024),
});

const env = envSchema.parse(process.env);

if (!env.JWT_SECRET && env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET is required in production");
}

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  host: env.HOST,
  jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  /** Fixed simulated deposit per participation, in cents. */
  depositAmountCents: parseFixed2(env.DEPOSIT_AMOUNT_USD),
  corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  /** Per-IP attempts per window on /auth/signup and /auth/login. */
  authRateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindowMs: env.AUTH_RATE_LIMIT_WINDOW_MS },
  bodyLimitBytes: env.BODY_LIMIT_BYTES,
} as const;
