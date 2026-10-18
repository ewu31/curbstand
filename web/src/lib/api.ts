import { ApiError } from "./api-error";
import { readSession, clearSession } from "./session";
import type * as Wire from "../../../packages/shared/src/index";
import type { Bid, Catalog, CreateGroupBuyInput, GroupBuyDetail, GroupBuySummary, Mine, Participant, PickupLocation } from "./types";

const base = () => (import.meta.env.PUBLIC_API_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const token = readSession()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${base()}${path}`, { ...init, headers }); }
  catch { throw new ApiError(0, "NETWORK", "Could not reach the Curbstand API."); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) clearSession();
    throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "The request failed.");
  }
  return body as T;
}
const post = (input: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(input) });
export const login = (email: string, password: string) => request<Wire.AuthResponse>("/auth/login", post({ email, password }));
export const signup = (input: Wire.SignupInput) => request<Wire.AuthResponse>("/auth/signup", post(input));

function location(row: Wire.PickupLocationDto): PickupLocation {
  return { id: row.id, name: row.name, address: `${row.neighborhood}, ${row.city}`, region: row.city, timezone: "America/Los_Angeles", active: true };
}
function participant(row: Wire.ParticipantDto): Participant {
  return { ...row, requestedLbs: Number(row.requestedLbs), depositAmount: Number(row.depositAmountUsd), completionStatus: row.completionStatus === "checked_in_qr" || row.completionStatus === "checked_in_manual" ? "completed" : row.completionStatus };
}
function summary(row: Wire.GroupBuySummary): GroupBuySummary {
  return { ...row, produceType: row.produceType.id, pickupLocation: location(row.pickupLocation), createdBy: row.createdById,
    targetLbs: Number(row.targetLbs), committedLbs: Number(row.committedLbs), remainingLbs: Number(row.remainingLbs),
    pricePerLb: row.pricePerLbUsd == null ? null : Number(row.pricePerLbUsd), seller: { id: row.createdById, name: row.sellerName, photoUrl: row.sellerPhotoUrl || "/avatars/guest.svg", ...(row.producerType ? { producerType: row.producerType } : {}) }, lowestBidPerLb: null };
}
export async function getCatalog(): Promise<Catalog> {
  const [produce, locations] = await Promise.all([request<Wire.ProduceTypesResponse>("/produce-types"), request<Wire.PickupLocationsResponse>("/pickup-locations")]);
  return { produce: produce.produceTypes.map(p => ({ slug: p.id, displayName: p.name })), locations: locations.pickupLocations.map(location) };
}
export async function listGroupBuys(filters: { produceType?: string; locationId?: string; status?: string }): Promise<GroupBuySummary[]> {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][]);
  const { groupBuys } = await request<Wire.ListGroupBuysResponse>(`/group-buys?${params}`);
  return groupBuys.map(row => summary(row));
}
export async function getGroupBuy(id: string): Promise<GroupBuyDetail> {
  const { groupBuy } = await request<Wire.GroupBuyResponse>(`/group-buys/${id}`);
  const bids: Bid[] = [];
  return { ...summary(groupBuy), participants: groupBuy.participants.map(participant), bids, events: groupBuy.events };
}
export async function createGroupBuy(input: CreateGroupBuyInput, _userId: string | null): Promise<GroupBuySummary> {
  const { groupBuy } = await request<Wire.GroupBuyResponse>("/group-buys", post({ ...input, targetLbs: input.targetLbs.toFixed(2), pricePerLbUsd: input.pricePerLb.toFixed(2) }));
  return summary(groupBuy);
}
export async function joinGroupBuy(id: string, requestedLbs: number, _userId: string | null): Promise<Participant> {
  return participant((await request<Wire.ParticipantResponse>(`/group-buys/${id}/participants`, post({ requestedLbs: requestedLbs.toFixed(2) }))).participant);
}
export async function updateStatus(id: string, status: "cancelled" | "ready_for_pickup", _userId: string | null) {
  const { groupBuy } = await request<Wire.GroupBuyResponse>(`/group-buys/${id}/status`, { ...post({ status }), method: "PATCH" });
  return { id, status: groupBuy.status };
}
export async function listMine(userId: string | null): Promise<Mine> {
  if (!userId) return { created: [], joined: [], bids: [] };
  const lists = await Promise.all(["open", "funding", "matched", "ready_for_pickup", "completed", "cancelled"].map(status => listGroupBuys({ status })));
  const list = lists.flat();
  const details = await Promise.all(list.map(item => getGroupBuy(item.id)));
  return {
    created: list.filter(item => item.createdBy === userId),
    joined: details.filter(item => item.participants.some(p => p.userId === userId)).map(summaryFromDetail),
    bids: details.filter(item => item.bids.some(b => b.producerId === userId)).map(summaryFromDetail),
  };
}
function summaryFromDetail(detail: GroupBuyDetail): GroupBuySummary {
  const active = detail.bids.filter(b => b.status === "submitted" || b.status === "selected");
  return { ...detail, lowestBidPerLb: active.length ? Math.min(...active.map(b => b.pricePerLb)) : null };
}

export const getProfile = () => request<Wire.MeResponse>("/me");
export const updateProfile = (producerType: "at_home" | "local_farmer" | "large_scale_farmer") => request<Wire.MeResponse>("/me", { method: "PATCH", body: JSON.stringify({ producerType }) });
