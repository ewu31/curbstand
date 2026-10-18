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
  const [price, setPrice] = useState("2.50");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedLocation = locationId || catalog?.locations[0]?.id || "";

  if (!catalog) return <p className="status-line">Loading</p>;
  if (session?.role === "customer") return <div className="form-panel"><h1>Producer account required</h1><p>Producers publish drops with a fixed price and minimum order.</p><a className="button" href="/">Back to produce</a></div>;

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
    const bid = pickupWindowStart;
    const pricePerLb = Number(price);
    if (!Number.isFinite(pricePerLb) || pricePerLb <= 0 || !/^\d+(\.\d{1,2})?$/.test(price)) { setMessage("Enter a positive price with at most two decimal places."); return; }
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
        pricePerLb,
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
      <h1>Create a drop</h1>
      {!session ? <p className="hint"><a className="inline-link" href="/login?next=/group-buys/new">Log in</a> to publish your drop.</p> : null}
      <p className="hint">Set your price and minimum. The proposed pickup date confirms automatically when the minimum is reached. Times are Pacific.</p>
      {message ? <p className="alert" role="alert">{message}</p> : null}
      <label className="field" htmlFor="produce">
        <span>Produce</span>
        <select id="produce" value={produceType} onChange={(event) => setProduceType(event.target.value)}>
          {catalog.produce.map((item) => <option key={item.slug} value={item.slug}>{item.displayName}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="target">
        <span>Minimum commitment (lb)</span>
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
      <label className="field" htmlFor="price"><span>Price per pound ($)</span><input id="price" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} /></label>
      <button className="button" type="submit" disabled={busy}>Publish drop</button>
    </form>
  );
}
