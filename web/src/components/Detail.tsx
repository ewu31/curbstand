import { useEffect, useState, type SubmitEvent } from "react";
import { actionError } from "../lib/api-error";
import { getGroupBuy, joinGroupBuy, placeBid, selectBid, updateStatus, updateDeposit, completePickup, isDemo } from "../lib/data";
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
  toPacificInput,
  pacificInputToIso,
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
        <button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        <a className="inline-link" href="/">Back to group buys</a>
      </div>
    );
  }
  if (!groupBuy || !catalog) return <p className="status-line">Loading</p>;

  const name = produceName(groupBuy.produceType, catalog.produce);
  const photo = producePhoto(groupBuy.produceType);
  const activeBids = groupBuy.bids.filter((bid) => bid.status === "submitted" || bid.status === "selected");
  const price = activeBids.length === 0 ? null : Math.min(...activeBids.map((bid) => bid.pricePerLb));
  const mine = session?.id ? groupBuy.participants.find((person) => person.userId === session.id) : undefined;
  const isOwner = session?.id === groupBuy.createdBy;
  const isSelectedProducer = Boolean(session?.id && groupBuy.bids.some((bid) => bid.id === groupBuy.selectedBidId && bid.producerId === session.id));
  const joinOpen = ["open", "funding"].includes(groupBuy.status) && new Date(groupBuy.joinDeadline) > new Date();
  const bidOpen = ["open", "funding"].includes(groupBuy.status) && new Date(groupBuy.bidDeadline) > new Date();
  const thresholdMet = groupBuy.committedLbs >= groupBuy.targetLbs;
  const sortedBids = [...groupBuy.bids].sort((a, b) => a.pricePerLb - b.pricePerLb);

  return (
    <article className="detail">
      {photo ? <img className="detail-photo" src={photo} alt="" /> : <span className="detail-photo photo-fallback" />}
      <div className="buy-box">
        <p className={price == null ? "buy-price price is-empty" : "buy-price"}>{price == null ? "No bids yet" : perLb(price)}</p>
        <h1>{name}</h1>
        <p className="meta">{statusLabel(groupBuy.status)}</p>
        <p className="buy-place">{groupBuy.pickupLocation?.name} · {groupBuy.pickupLocation?.address}</p>
        <p className="meta">{placeLabel(groupBuy.pickupLocation)} · {pickupWhen(groupBuy.pickupWindowStart, groupBuy.pickupWindowEnd)}</p>
        <p className="hint">{dateTime(groupBuy.pickupWindowStart)} – {dateTime(groupBuy.pickupWindowEnd)}</p>
        <p className="deadlines">Join by {dateTime(groupBuy.joinDeadline)}</p>
        <p className="deadlines">Bids by {dateTime(groupBuy.bidDeadline)}</p>
        <p className="qty">{progressLabel(groupBuy.committedLbs, groupBuy.targetLbs)}</p>
        <div className="bar" aria-hidden="true"><span style={{ width: `${barWidth(groupBuy.committedLbs, groupBuy.targetLbs)}%` }} /></div>
        {actionMessage ? <p className="alert" role="alert">{actionMessage}</p> : null}
        {!session ? <p className="hint"><a className="inline-link" href={`/login?next=${encodeURIComponent(`/group-buys/${id}`)}`}>Log in to join or place a bid</a></p> : null}

        {mine ? (
          <p className="hint">You asked for {formatQty(mine.requestedLbs)} lb. Deposit intent · {usd(mine.depositAmount)} · {depositLabel(mine.depositStatus)}</p>
        ) : null}
        {!mine && session?.role === "customer" && joinOpen ? (
          <JoinForm busy={busy} onSubmit={(requestedLbs) => run(() => joinGroupBuy(id, requestedLbs, session.id))} />
        ) : null}
        {!joinOpen && !mine && session?.role === "customer" ? <p className="hint">Joining is closed.</p> : null}
        {session?.role === "producer" && bidOpen ? (
          <BidForm
            busy={busy}
            pickupStart={groupBuy.pickupWindowStart}
            pickupEnd={groupBuy.pickupWindowEnd}
            onSubmit={(input) => run(() => placeBid(id, input, session.id))}
          />
        ) : null}
        {session?.role === "producer" && !bidOpen && groupBuy.status !== "matched" && groupBuy.status !== "ready_for_pickup" ? <p className="hint">Bidding is closed.</p> : null}

        {isOwner && groupBuy.status === "funding" && !thresholdMet ? (
          <p className="hint">Select a bid once committed pounds reach the target.</p>
        ) : null}
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
          <h2>Bids</h2>
          {sortedBids.length === 0 ? <p className="hint">No bids yet.</p> : (
            <table className="bids">
              <thead>
                <tr>
                  <th>Price</th>
                  <th>Available</th>
                  <th>Window</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedBids.map((bid) => (
                  <tr key={bid.id}>
                    <td>{perLb(bid.pricePerLb)}{bid.status === "selected" ? " · Selected" : ""}</td>
                    <td>{formatQty(bid.availableLbs)} lb</td>
                    <td>{pickupWhen(bid.availabilityWindowStart, bid.availabilityWindowEnd)}{bid.notes ? ` · ${bid.notes}` : ""}</td>
                    <td>
                      {isOwner && bidOpen && groupBuy.status === "funding" && thresholdMet && bid.status === "submitted" ? (
                        <button className="text-button" type="button" disabled={busy} onClick={() => void run(() => selectBid(id, bid.id, session?.id ?? null))}>Select</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

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

function JoinForm({ busy, onSubmit }: { busy: boolean; onSubmit: (requestedLbs: number) => void }) {
  const [pounds, setPounds] = useState("10");
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedLbs = Number(pounds);
    if (!Number.isFinite(requestedLbs) || !(requestedLbs > 0)) {
      setMessage("Enter pounds above 0.");
      return;
    }
    setMessage(null);
    onSubmit(requestedLbs);
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p className="hint">Joining records a deposit intent. It does not collect money.</p>
      <label className="field">
        <span>Pounds</span>
        <input inputMode="decimal" value={pounds} onChange={(event) => setPounds(event.target.value)} aria-label="Pounds" />
      </label>
      {message ? <p className="alert" role="alert">{message}</p> : null}
      <button className="button" type="submit" disabled={busy}>Join</button>
    </form>
  );
}

function BidForm({
  busy,
  pickupStart,
  pickupEnd,
  onSubmit,
}: {
  busy: boolean;
  pickupStart: string;
  pickupEnd: string;
  onSubmit: (input: { pricePerLb: number; availableLbs: number; availabilityWindowStart: string; availabilityWindowEnd: string; notes?: string }) => void;
}) {
  const [price, setPrice] = useState("");
  const [available, setAvailable] = useState("");
  const [start, setStart] = useState(toPacificInput(pickupStart));
  const [end, setEnd] = useState(toPacificInput(pickupEnd));
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const pricePerLb = Number(price);
    const availableLbs = Number(available);
    const availabilityWindowStart = pacificInputToIso(start);
    const availabilityWindowEnd = pacificInputToIso(end);
    if (!Number.isFinite(pricePerLb) || !Number.isFinite(availableLbs) || !(pricePerLb > 0) || !(availableLbs > 0) || !availabilityWindowStart || !availabilityWindowEnd) {
      setMessage("Enter a price per lb, available pounds, and an availability window.");
      return;
    }
    if (new Date(availabilityWindowStart) > new Date(pickupStart) || new Date(availabilityWindowEnd) < new Date(pickupEnd)) {
      setMessage("Availability must cover the entire pickup window.");
      return;
    }
    setMessage(null);
    onSubmit({
      pricePerLb,
      availableLbs,
      availabilityWindowStart,
      availabilityWindowEnd,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <h2>Place a bid</h2>
      <label className="field">
        <span>Price per lb</span>
        <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} aria-label="Price per lb" />
      </label>
      <label className="field">
        <span>Available pounds</span>
        <input inputMode="decimal" value={available} onChange={(event) => setAvailable(event.target.value)} aria-label="Available pounds" />
      </label>
      <label className="field">
        <span>Available from</span>
        <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} aria-label="Available from" />
      </label>
      <label className="field">
        <span>Available until</span>
        <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="Available until" />
      </label>
      <p className="hint">Times are Pacific. Availability has to cover the pickup window.</p>
      <label className="field">
        <span>Notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Notes" />
      </label>
      {message ? <p className="alert" role="alert">{message}</p> : null}
      <button className="button" type="submit" disabled={busy}>Place bid</button>
    </form>
  );
}
