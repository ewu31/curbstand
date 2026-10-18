export type Role = "customer" | "producer";

export type GroupBuyStatus =
  | "open"
  | "funding"
  | "matched"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

export type BidStatus = "submitted" | "selected" | "rejected" | "not_selected" | "withdrawn";

export type DepositStatus = "pending" | "confirmed_manual" | "refunded_manual" | "forfeited_manual";

export type Produce = {
  slug: string;
  displayName: string;
};

export type PickupLocation = {
  id: string;
  name: string;
  address: string;
  region: string;
  timezone: string;
  active: boolean;
};

export type Bid = {
  id: string;
  groupBuyId: string;
  producerId: string;
  pricePerLb: number;
  availableLbs: number;
  availabilityWindowStart: string;
  availabilityWindowEnd: string;
  notes: string | null;
  status: BidStatus;
  createdAt: string;
};

export type Participant = {
  id: string;
  groupBuyId: string;
  userId: string;
  requestedLbs: number;
  depositAmount: number;
  depositStatus: DepositStatus;
  completionStatus: "pending" | "completed" | "no_show";
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GroupBuyEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export type SellerProfile = {
  id?: string;
  name: string;
  producerType?: "at_home" | "local_farmer" | "large_scale_farmer" | null;
  photoUrl?: string | null;
  bio?: string | null;
  rating?: number | null;
  reviewCount?: number;
};

export type GroupBuySummary = {
  pricePerLb?: number | null;
  seller?: SellerProfile | null;
  description?: string | null;
  id: string;
  produceType: string;
  targetLbs: number;
  committedLbs: number;
  remainingLbs: number;
  status: GroupBuyStatus;
  pickupLocation: PickupLocation | null;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  joinDeadline: string;
  bidDeadline: string;
  selectedBidId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lowestBidPerLb: number | null;
};

export type GroupBuyDetail = Omit<GroupBuySummary, "lowestBidPerLb"> & {
  participants: Participant[];
  bids: Bid[];
  events: GroupBuyEvent[];
};

export type Catalog = {
  produce: Produce[];
  locations: PickupLocation[];
};

export type CreateGroupBuyInput = {
  pricePerLb: number;
  produceType: string;
  targetLbs: number;
  pickupLocationId: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  joinDeadline: string;
  bidDeadline: string;
};

export type BidInput = {
  pricePerLb: number;
  availableLbs: number;
  availabilityWindowStart: string;
  availabilityWindowEnd: string;
  notes?: string;
};

export type Mine = {
  created: GroupBuySummary[];
  joined: GroupBuySummary[];
  bids: GroupBuySummary[];
};
