import type { Bid, DepositStatus, GroupBuyStatus, Produce, PickupLocation } from "./types";

const PHOTO_JPG = new Set(["apples", "carrots", "tomatoes", "leafy-greens"]);

export function produceName(slug: string, produce: Produce[]) {
  return produce.find((item) => item.slug === slug)?.displayName ?? slug;
}

export function producePhoto(slug: string) {
  return PHOTO_JPG.has(slug) ? `/produce/${slug}.jpg` : `/produce/${slug}.svg`;
}

export function placeLabel(location: PickupLocation | null) {
  if (!location) return "Pickup TBD";
  const neighborhood = location.address.split(",")[0]?.trim();
  return neighborhood || location.name;
}

export function perLb(amount: number) {
  return `${usd(amount)} / lb`;
}

export function usd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatQty(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

export function progressLabel(committed: number, target: number) {
  return `${formatQty(committed)} of ${formatQty(target)} lb`;
}

export function barWidth(committed: number, target: number) {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (committed / target) * 100));
}

export function lowestBid(bids: Bid[]) {
  const active = bids.filter((bid) => bid.status === "submitted" || bid.status === "selected");
  if (active.length === 0) return null;
  return Math.min(...active.map((bid) => bid.pricePerLb));
}

export function statusLabel(status: GroupBuyStatus) {
  switch (status) {
    case "open":
      return "Open";
    case "funding":
      return "Filling";
    case "matched":
      return "Confirmed";
    case "ready_for_pickup":
      return "Ready for pickup";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

export function depositLabel(status: DepositStatus) {
  switch (status) {
    case "pending":
      return "pending";
    case "confirmed_manual":
      return "confirmed manually";
    case "refunded_manual":
      return "marked refunded";
    case "forfeited_manual":
      return "marked forfeited";
  }
}

export function eventLabel(eventType: string) {
  switch (eventType) {
    case "group_buy_created":
      return "Group buy created";
    case "participant_joined":
      return "Someone joined";
    case "bid_submitted":
      return "Bid submitted";
    case "bid_selected":
      return "Bid selected";
    case "group_buy_cancelled":
      return "Cancelled";
    case "group_buy_ready_for_pickup":
      return "Marked ready for pickup";
    default:
      return eventType.replaceAll("_", " ");
  }
}

export function dateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

type ClockParts = { weekday: string; hour: string; minute: string; period: string };

function clockParts(iso: string): ClockParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    hour: get("hour"),
    minute: get("minute"),
    period: get("dayPeriod").toLowerCase().replace(".", ""),
  };
}

export function pickupWhen(startIso: string, endIso: string) {
  const start = clockParts(startIso);
  const end = clockParts(endIso);
  if (start.minute === "00" && end.minute === "00" && start.period === end.period) {
    return `${start.weekday} ${start.hour}–${end.hour}${start.period}`;
  }
  const startMinute = start.minute === "00" ? "" : `:${start.minute}`;
  const endMinute = end.minute === "00" ? "" : `:${end.minute}`;
  return `${start.weekday} ${start.hour}${startMinute}${start.period}–${end.hour}${endMinute}${end.period}`;
}

function laToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function addDays(today: { y: number; m: number; d: number }, days: number) {
  const utc = new Date(Date.UTC(today.y, today.m - 1, today.d + days));
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function pacificOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(instant);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-7";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return -420;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
}

export function pacificInputValue(daysFromToday: number, hour: number, minute = 0) {
  const date = addDays(laToday(), daysFromToday);
  return `${date.y}-${pad(date.m)}-${pad(date.d)}T${pad(hour)}:${pad(minute)}`;
}

export function pacificInputToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const hh = Number(hour);
  const mm = Number(minute);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const firstOffset = pacificOffsetMinutes(new Date(asUtc));
  const corrected = asUtc - firstOffset * 60_000;
  const offset = pacificOffsetMinutes(new Date(corrected));
  const sign = offset <= 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const offsetHour = pad(Math.floor(absolute / 60));
  const offsetMinute = pad(absolute % 60);
  return `${year}-${month}-${day}T${hour}:${minute}:00${sign}${offsetHour}:${offsetMinute}`;
}

export function toPacificInput(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour").padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export function scheduleError(input: {
  pickupWindowStart: string;
  pickupWindowEnd: string;
  joinDeadline: string;
  bidDeadline: string;
}) {
  const start = new Date(input.pickupWindowStart);
  const end = new Date(input.pickupWindowEnd);
  const join = new Date(input.joinDeadline);
  const bid = new Date(input.bidDeadline);
  if ([start, end, join, bid].some((date) => Number.isNaN(date.getTime()))) return "Enter each date and time.";
  if (!(start < end)) return "Pickup end has to be after pickup starts.";
  if (!(join < bid)) return "Join deadline has to be before the bid deadline.";
  if (!(bid <= start)) return "Bid deadline has to be at or before pickup starts.";
  return null;
}
