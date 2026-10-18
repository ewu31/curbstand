import { useState, type SubmitEvent } from "react";
import { actionError } from "../lib/api-error";
import { createGroupBuy } from "../lib/data";
import { pacificInputToIso, pacificInputValue, scheduleError } from "../lib/format";
import type { Catalog } from "../lib/types";
import type { Session } from "../lib/session";

export default function CreateGroupBuy({ catalog, session }: { catalog: Catalog | null; session: Session | null }) {
  const [produceType, setProduceType] = useState(catalog?.produce[0]?.slug ?? "tomatoes");
  const [target, setTarget] = useState("50");
  const [locationId, setLocationId] = useState("");
  const [pickupStart, setPickupStart] = useState(pacificInputValue(7, 9));
  const [pickupEnd, setPickupEnd] = useState(pacificInputValue(7, 11));
  const [joinDeadline, setJoinDeadline] = useState(pacificInputValue(5, 17));
  const [bidDeadline, setBidDeadline] = useState(pacificInputValue(6, 17));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedLocation = locationId || catalog?.locations[0]?.id || "";

  if (!catalog) return <p className="status-line">Loading</p>;
  if (session?.role === "producer") return <div className="form-panel"><h1>Find a group buy to supply</h1><p>Customers create requests. As a producer, you can browse requests and place a bid.</p><a className="button" href="/you">View open requests</a></div>;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetLbs = Number(target);
    if (!Number.isFinite(targetLbs) || !(targetLbs > 0)) {
      setMessage("Enter a target above 0 lb.");
      return;
    }
    const pickupWindowStart = pacificInputToIso(pickupStart);
    const pickupWindowEnd = pacificInputToIso(pickupEnd);
    const join = pacificInputToIso(joinDeadline);
    const bid = pacificInputToIso(bidDeadline);
    if (!pickupWindowStart || !pickupWindowEnd || !join || !bid) {
      setMessage("Enter each date and time.");
      return;
    }
    const schedule = scheduleError({ pickupWindowStart, pickupWindowEnd, joinDeadline: join, bidDeadline: bid });
    if (schedule) {
      setMessage(schedule);
      return;
    }
    if (!selectedLocation) {
      setMessage("Choose a pickup location.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await createGroupBuy({
        produceType,
        targetLbs,
        pickupLocationId: selectedLocation,
        pickupWindowStart,
        pickupWindowEnd,
        joinDeadline: join,
        bidDeadline: bid,
      }, session?.id ?? null);
      window.location.assign(`/group-buys/${created.id}`);
    } catch (reason) {
      setMessage(actionError(reason));
      setBusy(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={submit} noValidate>
      <h1>Create a group buy</h1>
      {!session ? <p className="hint"><a className="inline-link" href="/login?next=/group-buys/new">Log in</a> to publish your group buy.</p> : null}
      <p className="hint">Times are Pacific. The bid deadline has to fall before pickup starts.</p>
      {message ? <p className="alert" role="alert">{message}</p> : null}
      <label className="field" htmlFor="produce">
        <span>Produce</span>
        <select id="produce" value={produceType} onChange={(event) => setProduceType(event.target.value)}>
          {catalog.produce.map((item) => <option key={item.slug} value={item.slug}>{item.displayName}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="target">
        <span>Target (lb)</span>
        <input id="target" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />
      </label>
      <label className="field" htmlFor="location">
        <span>Pickup location</span>
        <select id="location" value={selectedLocation} onChange={(event) => setLocationId(event.target.value)}>
          {catalog.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="pickup-start">
        <span>Pickup starts</span>
        <input id="pickup-start" type="datetime-local" value={pickupStart} onChange={(event) => setPickupStart(event.target.value)} />
      </label>
      <label className="field" htmlFor="pickup-end">
        <span>Pickup ends</span>
        <input id="pickup-end" type="datetime-local" value={pickupEnd} onChange={(event) => setPickupEnd(event.target.value)} />
      </label>
      <label className="field" htmlFor="join-deadline">
        <span>Join deadline</span>
        <input id="join-deadline" type="datetime-local" value={joinDeadline} onChange={(event) => setJoinDeadline(event.target.value)} />
      </label>
      <label className="field" htmlFor="bid-deadline">
        <span>Bid deadline</span>
        <input id="bid-deadline" type="datetime-local" value={bidDeadline} onChange={(event) => setBidDeadline(event.target.value)} />
      </label>
      <button className="button" type="submit" disabled={busy}>Create group buy</button>
    </form>
  );
}
