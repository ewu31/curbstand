import type { GroupBuySummary } from "./types";

export function isJoinable(drop: GroupBuySummary, now = Date.now()) {
  return ["open", "funding"].includes(drop.status) && Date.parse(drop.joinDeadline) > now;
}
export function almostThere(drop: GroupBuySummary, now = Date.now()) {
  return isJoinable(drop, now) && drop.targetLbs > 0 && drop.committedLbs / drop.targetLbs >= .75 && drop.committedLbs < drop.targetLbs;
}
export function recommendedDrops(drops: GroupBuySummary[], now = Date.now()) {
  return [...drops].sort((a, b) => {
    const priority = Number(almostThere(b, now)) - Number(almostThere(a, now));
    if (priority) return priority;
    const open = Number(isJoinable(b, now)) - Number(isJoinable(a, now));
    if (open) return open;
    if (almostThere(a, now) && almostThere(b, now)) return b.committedLbs / b.targetLbs - a.committedLbs / a.targetLbs;
    return Date.parse(a.pickupWindowStart) - Date.parse(b.pickupWindowStart);
  });
}
