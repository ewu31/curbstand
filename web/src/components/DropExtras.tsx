import { useEffect, useState } from "react";
import type { SellerProfile } from "../lib/types";
import FollowButton from "./FollowButton";

const producerLabels = {
  at_home: "At home",
  local_farmer: "Local farmer",
  large_scale_farmer: "Large scale farmer",
} as const;

export function Seller({ seller, expanded = false, viewerId = null }: { seller?: SellerProfile | null; expanded?: boolean; viewerId?: string | null }) {
  const [failed, setFailed] = useState(false);
  const producerType = seller?.producerType ? producerLabels[seller.producerType] : null;
  const photo = !failed && seller?.photoUrl ? seller.photoUrl : "/avatars/guest.svg";
  return <div className={expanded ? "seller seller-expanded" : "seller"}>
    <img className="seller-avatar" src={photo} alt="" onError={() => setFailed(true)} />
    <div><strong>{seller?.name || "Seller to be confirmed"}</strong>{producerType ? <span>{producerType}</span> : null}{seller?.rating != null ? <span>{`★ ${seller.rating.toFixed(1)}${seller.reviewCount != null ? ` · ${seller.reviewCount} reviews` : ""}`}</span> : expanded ? <span>Not yet rated</span> : null}
    {expanded ? <p>{seller?.bio || "Fresh produce from your drop's grower."}</p> : null}
    {expanded && seller?.id ? <FollowButton producerId={seller.id} viewerId={viewerId} /> : null}</div>
  </div>;
}
export function Countdown({ start, end, status }: { start: string; end: string; status: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  let label = "Checking pickup time...";
  if (status === "cancelled") label = "Drop cancelled";
  else if (status === "completed") label = "Drop completed";
  else if (now !== null) {
    const diff = Date.parse(start) - now;
    if (now >= Date.parse(end)) label = "Pickup window ended";
    else if (diff <= 0) label = "Pickup window is open";
    else { const minutes = Math.ceil(diff / 60000); label = `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h ${minutes % 60}m`; }
  }
  return <div className="countdown"><span>Time till drop</span><strong>{label}</strong><small>{["open", "funding"].includes(status) ? "Proposed pickup" : "Pickup"} · Pacific time</small></div>;
}
