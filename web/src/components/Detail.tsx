import { Seller, Countdown } from "./DropExtras";
import GroceryPrices from "./GroceryPrices";
import { useEffect, useState } from "react";
import { actionError } from "../lib/api-error";
import { getGroupBuy, updateStatus, updateDeposit, completePickup, isDemo } from "../lib/data";
import {
  barWidth,
  dateTime,
  depositLabel,
  eventLabel,
  formatQty,
  perLb,
  pickupWhen,
  placeLabel,
  produceName,
  producePhoto,
  progressLabel,
  statusLabel,
  usd,
} from "../lib/format";
import type { Catalog, GroupBuyDetail } from "../lib/types";
import type { Session } from "../lib/session";

export default function Detail({ id, catalog, session }: { id: string; catalog: Catalog | null; session: Session | null }) {
  const [groupBuy, setGroupBuy] = useState<GroupBuyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    getGroupBuy(id)
      .then((next) => {
        if (!active) return;
        setGroupBuy(next);
        if (catalog) document.title = `${produceName(next.produceType, catalog.produce)} · Curbstand`;
      })
      .catch((reason) => { if (active) setError(actionError(reason)); });
    return () => { active = false; };
  }, [id, attempt, catalog]);

  useEffect(() => {
    setGroupBuy(null);
  }, [id]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setActionMessage(null);
    try {
      await work();
      setAttempt((value) => value + 1);
    } catch (reason) {
      setActionMessage(actionError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="empty">
        <h1 className="page-title">Group buy</h1>
        <p className="alert" role="alert">{error}</p>
        {!session ? <a className="inline-link" href={`/login?next=${encodeURIComponent(`/group-buys/${id}`)}`}>Log in to view this group buy</a> : null}
        <button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        <a className="inline-link" href="/">Back to group buys</a>
      </div>
    );
  }
  if (!groupBuy || !catalog) return <p className="status-line">Loading</p>;

  const name = produceName(groupBuy.produceType, catalog.produce);
  const photo = groupBuy.imageUrls?.[0] || producePhoto(groupBuy.produceType);
  const price = groupBuy.pricePerLb ?? null;
  const mine = session?.id ? groupBuy.participants.find((person) => person.userId === session.id) : undefined;
  const isOwner = session?.id === groupBuy.createdBy;
  const isSelectedProducer = isOwner && session?.role === "producer";
  const joinOpen = price != null && ["open", "funding"].includes(groupBuy.status) && new Date(groupBuy.joinDeadline) > new Date();
  const confirmed = ["matched", "ready_for_pickup", "completed"].includes(groupBuy.status);

  return (
    <article className="detail">
      <a className="detail-back inline-link" href="/">&larr; All drops</a>
      {photo ? <img className="detail-photo" src={photo} alt="" /> : <span className="detail-photo photo-fallback" />}
      <div className="buy-box">
        <p className={price == null ? "buy-price price is-empty" : "buy-price"}>{price == null ? "Price unavailable" : perLb(price)}</p>
        <h1>{name}</h1>
        <p className="meta">{statusLabel(groupBuy.status)}</p>
        <section className="drop-schedule" aria-label="Drop schedule">
          <p className="eyebrow">{confirmed ? "Drop confirmed" : groupBuy.status === "cancelled" ? "Drop cancelled" : "Proposed drop - pending minimum"}</p>
          <p className="drop-time">{pickupWhen(groupBuy.pickupWindowStart, groupBuy.pickupWindowEnd)}</p>
          <p>{dateTime(groupBuy.pickupWindowStart)} &ndash; {dateTime(groupBuy.pickupWindowEnd)}</p>
          <p className="hint">{confirmed ? "The minimum has been reached. Your pickup date is confirmed." : `The date confirms automatically when commitments reach ${formatQty(groupBuy.targetLbs)} lb.`}</p>
        </section>
        <Seller seller={groupBuy.seller} expanded viewerId={session?.id ?? null} />
        <GroceryPrices produceSlug={groupBuy.produceType} />
        {groupBuy.products && groupBuy.products.length > 1 ? <section className="drop-products"><h2>Available from this grower</h2><ul>{groupBuy.products.map((product) => <li key={product.id}>{produceName(product.produceType, catalog.produce)} · {perLb(product.pricePerLb)} · {formatQty(product.availableLbs)} lb available</li>)}</ul></section> : null}
        <section className="drop-description"><h2>About this drop</h2><p>{groupBuy.description || `Join your neighbors for a shared order of ${name.toLowerCase()} at ${placeLabel(groupBuy.pickupLocation)}. Together, the group needs ${formatQty(groupBuy.targetLbs)} lb to reach its minimum. Check the pickup window before joining.`}</p></section>
        <Countdown start={groupBuy.pickupWindowStart} end={groupBuy.pickupWindowEnd} status={groupBuy.status} />
        <p className="buy-place">{groupBuy.pickupLocation?.name} · {groupBuy.pickupLocation?.address}</p>
        <p className="deadlines">Join by {dateTime(groupBuy.joinDeadline)}</p>

        <p className="qty">{progressLabel(groupBuy.committedLbs, groupBuy.targetLbs)}</p>
        <div className="bar" aria-hidden="true"><span style={{ width: `${barWidth(groupBuy.committedLbs, groupBuy.targetLbs)}%` }} /></div>
        {actionMessage ? <p className="alert" role="alert">{actionMessage}</p> : null}
        {!session ? <p className="hint"><a className="inline-link" href={`/login?next=${encodeURIComponent(`/group-buys/${id}`)}`}>Log in to commit to this drop</a></p> : null}

        {mine ? (
          <p className="hint">You asked for {formatQty(mine.requestedLbs)} lb. Deposit intent · {usd(mine.depositAmount)} · {depositLabel(mine.depositStatus)}</p>
        ) : null}
        {!mine && session?.role === "customer" && joinOpen ? (
          <a className="button" href={`/group-buys/${id}/purchase`}>Purchase</a>
        ) : null}
        {!joinOpen && !mine && session?.role === "customer" ? <p className="hint">Joining is closed.</p> : null}
        <div className="actions">
          {isOwner && ["open", "funding"].includes(groupBuy.status) ? (
            <button className="text-button" type="button" disabled={busy} onClick={() => {
              if (!window.confirm("Cancel this group buy?")) return;
              void run(() => updateStatus(id, "cancelled", session?.id ?? null));
            }}>Cancel group buy</button>
          ) : null}
          {isSelectedProducer && session && groupBuy.status === "matched" ? (
            <button className="button" type="button" disabled={busy} onClick={() => void run(() => updateStatus(id, "ready_for_pickup", session.id))}>
              Mark ready for pickup
            </button>
          ) : null}
        </div>
        <div className="actions"><button className="text-button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Refresh status</button></div>

        <section className="section">
          <h2>Participants</h2>
          {groupBuy.participants.length === 0 ? <p className="hint">No one has joined.</p> : (
            <ul className="people">
              {groupBuy.participants.map((person) => (
                <li key={person.id}>
                  {person.userId === session?.id ? "You" : "Participant"} · {formatQty(person.requestedLbs)} lb
                  <span>Deposit intent · {usd(person.depositAmount)} · {depositLabel(person.depositStatus)}</span>
                  <span>Pickup: {person.completionStatus === "completed" ? "Completed" : "Pending"}</span>
                  {isOwner && isDemo && person.depositStatus === "pending" ? <button className="text-button" disabled={busy} onClick={() => void run(() => updateDeposit(id, person.id, "confirmed_manual", session?.id ?? null))}>Confirm deposit manually</button> : null}
                  {isOwner && isDemo && person.depositStatus === "confirmed_manual" ? <div className="actions">
                    <button className="text-button" disabled={busy} onClick={() => void run(() => updateDeposit(id, person.id, "refunded_manual", session?.id ?? null))}>Mark refunded</button>
                    <button className="text-button" disabled={busy} onClick={() => void run(() => updateDeposit(id, person.id, "forfeited_manual", session?.id ?? null))}>Mark forfeited</button>
                  </div> : null}
                  {isDemo && groupBuy.status === "ready_for_pickup" && person.completionStatus === "pending" && (person.userId === session?.id || isSelectedProducer) ? <button className="button secondary" disabled={busy} onClick={() => void run(() => completePickup(id, person.id, session?.id ?? null))}>Confirm manual pickup</button> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Deposits are manual records. No money is collected or moved.</p>
          {!isDemo ? <p className="hint">Deposit updates and pickup check-in are awaiting backend support.</p> : null}
          {groupBuy.status === "ready_for_pickup" ? <p className="hint">QR check-in is unavailable. {isDemo ? "Use manual pickup confirmation at handoff." : "Contact the organizer to record your pickup."}</p> : null}
        </section>

        <section className="section">
          <h2>Activity</h2>
          <ul className="activity">
            {groupBuy.events.map((item) => (
              <li key={item.id}>{eventLabel(item.eventType)}<span>{dateTime(item.createdAt)}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
