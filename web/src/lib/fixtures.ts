import { lowestBid } from "./format";
import type { GroupBuyDetail, GroupBuySummary } from "./types";

export { createFixtureDetails, fixtureLocations, fixtureProduce } from "./submissions";

export function toSummary(detailRow: GroupBuyDetail): GroupBuySummary {
  return {
    pricePerLb: detailRow.pricePerLb,
    seller: detailRow.seller,
    description: detailRow.description,
    id: detailRow.id,
    produceType: detailRow.produceType,
    targetLbs: detailRow.targetLbs,
    committedLbs: detailRow.committedLbs,
    remainingLbs: detailRow.remainingLbs,
    status: detailRow.status,
    pickupLocation: detailRow.pickupLocation,
    pickupWindowStart: detailRow.pickupWindowStart,
    pickupWindowEnd: detailRow.pickupWindowEnd,
    joinDeadline: detailRow.joinDeadline,
    bidDeadline: detailRow.bidDeadline,
    selectedBidId: detailRow.selectedBidId,
    createdBy: detailRow.createdBy,
    createdAt: detailRow.createdAt,
    updatedAt: detailRow.updatedAt,
    lowestBidPerLb: lowestBid(detailRow.bids),
    products: detailRow.products,
    imageUrls: detailRow.imageUrls,
  };
}
