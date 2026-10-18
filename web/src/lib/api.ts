import { ApiError } from "./api-error";
import type { Bid, BidInput, Catalog, CreateGroupBuyInput, GroupBuyDetail, GroupBuySummary, Mine, Participant } from "./types";

const base = () => (import.meta.env.PUBLIC_API_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");

async function request<T>(path: string, userId?: string | null, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (userId) headers.set("x-user-id", userId);
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "NETWORK", "Could not reach the Curbstand API.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body?.error?.code ?? "REQUEST_FAILED";
    const message = body?.error?.message ?? "The request failed.";
    throw new ApiError(response.status, code, message);
  }
  return body.data as T;
}

export async function getCatalog(): Promise<Catalog> {
  const [produce, locations] = await Promise.all([
    request<Catalog["produce"]>("/produce"),
    request<Catalog["locations"]>("/pickup-locations"),
  ]);
  return { produce, locations };
}

export function listGroupBuys(filters: { produceType?: string; locationId?: string }) {
  const params = new URLSearchParams();
  if (filters.produceType) params.set("produceType", filters.produceType);
  if (filters.locationId) params.set("locationId", filters.locationId);
  const query = params.toString();
  return request<GroupBuySummary[]>(`/group-buys${query ? `?${query}` : ""}`);
}

export function getGroupBuy(id: string) {
  return request<GroupBuyDetail>(`/group-buys/${id}`);
}

export function createGroupBuy(input: CreateGroupBuyInput, userId: string | null) {
  return request<GroupBuySummary>("/group-buys", userId, { method: "POST", body: JSON.stringify(input) });
}

export function joinGroupBuy(id: string, requestedLbs: number, userId: string | null) {
  return request<Participant>(`/group-buys/${id}/participants`, userId, {
    method: "POST",
    body: JSON.stringify({ requestedLbs }),
  });
}

export function placeBid(id: string, input: BidInput, userId: string | null) {
  return request<Bid>(`/group-buys/${id}/bids`, userId, { method: "POST", body: JSON.stringify(input) });
}

export function selectBid(id: string, bidId: string, userId: string | null) {
  return request<{ groupBuyId: string; selectedBidId: string; status: string }>(`/group-buys/${id}/select-bid`, userId, {
    method: "POST",
    body: JSON.stringify({ bidId }),
  });
}

export function updateStatus(id: string, status: "cancelled" | "ready_for_pickup", userId: string | null) {
  return request<{ id: string; status: string }>(`/group-buys/${id}/status`, userId, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function listMine(userId: string | null): Promise<Mine> {
  if (!userId) return { created: [], joined: [], bids: [] };
  const list = await listGroupBuys({});
  const details = await Promise.all(list.map((item) => getGroupBuy(item.id)));
  return {
    created: list.filter((item) => item.createdBy === userId),
    joined: details.filter((item) => item.participants.some((person) => person.userId === userId)).map(summaryFromDetail),
    bids: details.filter((item) => item.bids.some((bid) => bid.producerId === userId)).map(summaryFromDetail),
  };
}

function summaryFromDetail(detail: GroupBuyDetail): GroupBuySummary {
  const active = detail.bids.filter((bid) => bid.status === "submitted" || bid.status === "selected");
  const lowestBidPerLb = active.length === 0 ? null : Math.min(...active.map((bid) => bid.pricePerLb));
  return { ...detail, lowestBidPerLb };
}
