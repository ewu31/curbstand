import { barWidth, perLb, placeLabel, produceName, producePhoto, progressLabel, pickupWhen } from "../lib/format";
import type { GroupBuySummary, Produce } from "../lib/types";

export default function ListingCard({ groupBuy, produce }: { groupBuy: GroupBuySummary; produce: Produce[] }) {
  const name = produceName(groupBuy.produceType, produce);
  const photo = producePhoto(groupBuy.produceType);
  return (
    <a className="card" href={`/group-buys/${groupBuy.id}`}>
      {photo ? <img src={photo} alt="" /> : <span className="photo-fallback" />}
      <p className={groupBuy.lowestBidPerLb == null ? "price is-empty" : "price"}>
        {groupBuy.lowestBidPerLb == null ? "No bids yet" : perLb(groupBuy.lowestBidPerLb)}
      </p>
      <p className="card-title">{name}</p>
      <p className="meta">{placeLabel(groupBuy.pickupLocation)} · {pickupWhen(groupBuy.pickupWindowStart, groupBuy.pickupWindowEnd)}</p>
      <p className="qty">{progressLabel(groupBuy.committedLbs, groupBuy.targetLbs)}</p>
      <div className="bar" aria-hidden="true"><span style={{ width: `${barWidth(groupBuy.committedLbs, groupBuy.targetLbs)}%` }} /></div>
    </a>
  );
}
