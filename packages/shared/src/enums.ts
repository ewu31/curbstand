// Single source of truth for every status/enum string in the system.
// The database stores these as plain strings; always validate against these lists.

export const ROLES = ["customer", "producer"] as const;
export type Role = (typeof ROLES)[number];

export const ORG_TYPES = ["individual", "restaurant"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const GROUP_BUY_STATUSES = [
  "open",
  "funding",
  "matched",
  "ready_for_pickup",
  "completed",
  "cancelled",
] as const;
export type GroupBuyStatus = (typeof GROUP_BUY_STATUSES)[number];

/** Allowed lifecycle transitions (DESIGN.md §6.2). Guard conditions live in the owning task. */
export const GROUP_BUY_TRANSITIONS: Record<GroupBuyStatus, readonly GroupBuyStatus[]> = {
  open: ["funding", "cancelled"],
  funding: ["matched", "cancelled"],
  matched: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["completed"],
  completed: [],
  cancelled: [],
};

export function canTransitionGroupBuy(from: GroupBuyStatus, to: GroupBuyStatus): boolean {
  return GROUP_BUY_TRANSITIONS[from].includes(to);
}

export const BID_STATUSES = ["submitted", "selected", "not_selected", "withdrawn"] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

export const DEPOSIT_STATUSES = [
  "pending",
  "confirmed_manual",
  "refunded_manual",
  "forfeited_manual",
] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

/** Simulated deposit lifecycle (DESIGN.md §6.4). No state implies money moved. */
export const DEPOSIT_TRANSITIONS: Record<DepositStatus, readonly DepositStatus[]> = {
  pending: ["confirmed_manual", "refunded_manual"],
  confirmed_manual: ["refunded_manual", "forfeited_manual"],
  refunded_manual: [],
  forfeited_manual: [],
};

export function canTransitionDeposit(from: DepositStatus, to: DepositStatus): boolean {
  return DEPOSIT_TRANSITIONS[from].includes(to);
}

export const COMPLETION_STATUSES = [
  "pending",
  "checked_in_qr",
  "checked_in_manual",
  "no_show",
] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const EVENT_TYPES = [
  "group_buy.created",
  "group_buy.status_changed",
  "group_buy.cancelled",
  "group_buy.completed",
  "participant.joined",
  "participant.checked_in",
  "deposit.status_changed",
  "bid.submitted",
  "bid.selected",
  "fulfillment.confirmed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
