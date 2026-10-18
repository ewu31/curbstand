import { z } from "zod";

// Currency and quantity convention:
// - Storage: integers in minor units. Money = cents (USD). Quantity = hundredths of a pound.
// - API: decimal strings with exactly 2 fractional digits, e.g. "12.50" (USD) or "50.00" (lbs).
//   Field names carry the unit: `pricePerLbUsd`, `depositAmountUsd`, `targetLbs`, `requestedLbs`.
// - Never use JS floating-point numbers for money or quantity math.

export const CURRENCY = "USD" as const;

const FIXED2 = /^\d+(\.\d{1,2})?$/;

/** "12.5" -> 1250. Throws on negatives, >2 decimals, or non-numeric input. */
export function parseFixed2(value: string): number {
  if (!FIXED2.test(value)) throw new Error(`Invalid decimal amount: ${value}`);
  const [whole, frac = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount out of range: ${value}`);
  return minor;
}

/** 1250 -> "12.50" */
export function formatFixed2(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error(`Invalid minor-unit amount: ${minor}`);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export const usdToCents = parseFixed2;
export const centsToUsd = formatFixed2;
export const lbsToHundredths = parseFixed2;
export const hundredthsToLbs = formatFixed2;

/** Total cost in cents for a price (cents/lb) times a quantity (hundredths of lb), rounded half-up. */
export function lineTotalCents(priceCentsPerLb: number, lbsHundredths: number): number {
  return Math.floor((priceCentsPerLb * lbsHundredths + 50) / 100);
}

const fixed2String = z
  .string()
  .regex(FIXED2, "Must be a non-negative decimal string with at most 2 decimal places");

/** Zod: "12.50" -> 1250 (cents). Allows zero. */
export const usdAmountSchema = fixed2String.transform(parseFixed2);
/** Zod: "12.50" -> 1250 (cents). Must be > 0. */
export const positiveUsdAmountSchema = usdAmountSchema.refine((c) => c > 0, "Must be greater than 0");
/** Zod: "5.25" -> 525 (hundredths of lb). Must be > 0. */
export const positiveLbsSchema = fixed2String
  .transform(parseFixed2)
  .refine((h) => h > 0, "Must be greater than 0");
