import { barWidth, perLb, placeLabel, produceName, producePhoto, progressLabel, pickupWhen, formatQty, statusLabel } from "../lib/format";
import { almostThere } from "../lib/drops";
import type { GroupBuySummary, Produce } from "../lib/types";
import { Seller } from "./DropExtras";

export default function ListingCard({ groupBuy, produce }: { groupBuy: GroupBuySummary; produce: Produce[] }) {
  const name = produceName(groupBuy.produceType, produce);
  const photo = groupBuy.imageUrls?.[0] || producePhoto(groupBuy.produceType);
  const productCount = groupBuy.products?.length ?? 1;
  const close = almostThere(groupBuy);
  return (
    <a className="card" href={`/group-buys/${groupBuy.id}`}>
      <div className="card-image">
        {photo ? <img src={photo} alt={name} loading="lazy" /> : <span className="photo-fallback">{name}</span>}
        <span className={close ? "drop-badge close" : "drop-badge"}>{close ? "Almost there" : statusLabel(groupBuy.status)}</span>
      </div>
      <div className="card-body">
        <div className="card-heading"><h2 className="card-title">{productCount > 1 ? `${name} + ${productCount - 1} more` : name}</h2><p className={groupBuy.pricePerLb == null ? "price is-empty" : "price"}>{groupBuy.pricePerLb == null ? "Price unavailable" : perLb(groupBuy.pricePerLb)}</p></div>
        <Seller seller={groupBuy.seller} />
        <dl className="card-facts">
          <div><dt>Pickup</dt><dd>{placeLabel(groupBuy.pickupLocation)} · {pickupWhen(groupBuy.pickupWindowStart, groupBuy.pickupWindowEnd)}</dd></div>
          <div><dt>Progress</dt><dd>{progressLabel(groupBuy.committedLbs, groupBuy.targetLbs)} · {Math.round(barWidth(groupBuy.committedLbs, groupBuy.targetLbs))}%</dd></div>
          <div><dt>Minimum</dt><dd>{formatQty(groupBuy.targetLbs)} lb</dd></div>
        </dl>
        <div className="bar" aria-hidden="true"><span style={{ width: `${barWidth(groupBuy.committedLbs, groupBuy.targetLbs)}%` }} /></div>
      </div>
    </a>
  );
}
