import type { GroupBuySummary } from "./types";

export function isJoinable(drop: GroupBuySummary, now = Date.now()) {
  return ["open", "funding"].includes(drop.status) && Date.parse(drop.joinDeadline) > now;
}
export function almostThere(drop: GroupBuySummary, now = Date.now()) {
  return isJoinable(drop, now) && drop.targetLbs > 0 && drop.committedLbs / drop.targetLbs >= .75 && drop.committedLbs < drop.targetLbs;
}
export function recommendedDrops(drops: GroupBuySummary[], historyOrNow: GroupBuySummary[] | number = [], maybeNow = Date.now()) {
  const history = typeof historyOrNow === "number" ? [] : historyOrNow;
  const now = typeof historyOrNow === "number" ? historyOrNow : maybeNow;
  const historyTypes = new Set(history.flatMap((drop) => drop.products?.map((product) => product.produceType) ?? [drop.produceType]));
  return [...drops].sort((a, b) => {
    const preference = Number(historyTypes.has(b.produceType)) - Number(historyTypes.has(a.produceType));
    if (preference) return preference;
    const priority = Number(almostThere(b, now)) - Number(almostThere(a, now));
    if (priority) return priority;
    const open = Number(isJoinable(b, now)) - Number(isJoinable(a, now));
    if (open) return open;
    if (almostThere(a, now) && almostThere(b, now)) return b.committedLbs / b.targetLbs - a.committedLbs / a.targetLbs;
    return Date.parse(a.pickupWindowStart) - Date.parse(b.pickupWindowStart);
  });
}

export function recommendationLabel(history: GroupBuySummary[]) {
  if (!history.length) return "Drops close to their minimum come first.";
  return "Based on the produce you have ordered before, with close-to-minimum drops next.";
}
