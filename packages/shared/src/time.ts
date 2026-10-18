import { z } from "zod";

// Timestamp convention:
// - API: ISO 8601 strings in UTC with a `Z` suffix (Date#toISOString()).
// - Inputs may carry any offset; they are normalized to UTC.
// - Display: Pacific Time (DEMO_TIME_ZONE) with an explicit zone label.

export const DEMO_TIME_ZONE = "America/Los_Angeles";

export function toIso(date: Date): string {
  return date.toISOString();
}

export function toIsoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** Zod: ISO 8601 date-time string (with offset or Z) -> Date */
export const isoDateTimeSchema = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export function formatPacific(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DEMO_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(typeof date === "string" ? new Date(date) : date);
}
