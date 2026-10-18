import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { actionError } from "../lib/api-error";
import { createGroupBuy } from "../lib/data";
import { pacificInputToIso, pacificInputValue, scheduleError } from "../lib/format";
import type { Catalog, DropProduct } from "../lib/types";
import type { Session } from "../lib/session";

type DraftProduct = Omit<DropProduct, "id">;

export default function CreateGroupBuy({ catalog, session }: { catalog: Catalog | null; session: Session | null }) {
  const [products, setProducts] = useState<DraftProduct[]>([{ produceType: catalog?.produce[0]?.slug ?? "tomatoes", pricePerLb: 2.5, availableLbs: 50 }]);
  const [target, setTarget] = useState("50");
  const [locationId, setLocationId] = useState("");
  const [pickupStart, setPickupStart] = useState(pacificInputValue(7, 9));
  const [pickupEnd, setPickupEnd] = useState(pacificInputValue(7, 11));
  const [joinDeadline, setJoinDeadline] = useState(pacificInputValue(5, 17));
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedLocation = locationId || catalog?.locations[0]?.id || "";

  if (!catalog) return <p className="status-line">Loading</p>;
  if (session?.role === "customer") return <div className="form-panel"><h1>Producer account required</h1><p>Producers publish drops with multiple products and availability.</p><a className="button" href="/">Back to produce</a></div>;

  function updateProduct(index: number, update: Partial<DraftProduct>) {
    setProducts((current) => current.map((product, productIndex) => productIndex === index ? { ...product, ...update } : product));
  }

  function addProduct() {
    const available = catalog?.produce.find((item) => !products.some((product) => product.produceType === item.slug));
    if (available) setProducts((current) => [...current, { produceType: available.slug, pricePerLb: 2.5, availableLbs: 25 }]);
  }

  function readPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 4);
    Promise.all(files.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }))).then(setPhotoUrls).catch(() => setMessage("One of the selected images could not be read."));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetLbs = Number(target);
    const pickupWindowStart = pacificInputToIso(pickupStart);
    const pickupWindowEnd = pacificInputToIso(pickupEnd);
    const join = pacificInputToIso(joinDeadline);
    const bid = pickupWindowStart;
    if (!Number.isFinite(targetLbs) || targetLbs <= 0) return setMessage("Enter a target above 0 lb.");
    if (!products.length || products.some((product) => product.pricePerLb <= 0 || product.availableLbs <= 0)) return setMessage("Each product needs a price and available quantity above 0.");
    if (!pickupWindowStart || !pickupWindowEnd || !join || !bid) return setMessage("Enter each date and time.");
    const schedule = scheduleError({ pickupWindowStart, pickupWindowEnd, joinDeadline: join, bidDeadline: bid });
    if (schedule) return setMessage(schedule);
    if (!selectedLocation) return setMessage("Choose a pickup location.");
    setBusy(true);
    setMessage(null);
    try {
      const created = await createGroupBuy({
        produceType: products[0].produceType,
        targetLbs,
        pricePerLb: products[0].pricePerLb,
        products,
        imageUrls: photoUrls,
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
    <form className="form-panel seller-form" onSubmit={submit} noValidate>
      <h1>Create a drop</h1>
      {!session ? <p className="hint"><a className="inline-link" href="/login?next=/group-buys/new">Log in</a> to publish your drop.</p> : null}
      <p className="hint">Offer several products from the same pickup. Buyers can choose only the items they want.</p>
      {message ? <p className="alert" role="alert">{message}</p> : null}
      <fieldset className="product-editor">
        <legend>What is available?</legend>
        {products.map((product, index) => (
          <div className="product-row" key={`${index}-${product.produceType}`}>
            <label className="field"><span>Product</span><select value={product.produceType} onChange={(event) => updateProduct(index, { produceType: event.target.value })}>{catalog.produce.map((item) => <option key={item.slug} value={item.slug}>{item.displayName}</option>)}</select></label>
            <label className="field"><span>Price / lb</span><input inputMode="decimal" value={product.pricePerLb} onChange={(event) => updateProduct(index, { pricePerLb: Number(event.target.value) })} /></label>
            <label className="field"><span>Available lb</span><input inputMode="decimal" value={product.availableLbs} onChange={(event) => updateProduct(index, { availableLbs: Number(event.target.value) })} /></label>
            {products.length > 1 ? <button className="text-button" type="button" onClick={() => setProducts((current) => current.filter((_, productIndex) => productIndex !== index))}>Remove</button> : null}
          </div>
        ))}
        <button className="text-button" type="button" onClick={addProduct} disabled={products.length >= catalog.produce.length}>+ Add another product</button>
      </fieldset>
      <label className="field" htmlFor="target"><span>Minimum combined commitment (lb)</span><input id="target" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
      <label className="field" htmlFor="drop-photos"><span>Drop photos (up to 4)</span><input id="drop-photos" type="file" accept="image/*" multiple onChange={readPhotos} /></label>
      {photoUrls.length ? <div className="photo-preview" aria-label="Selected drop photos">{photoUrls.map((url) => <img key={url} src={url} alt="" />)}</div> : null}
      <label className="field" htmlFor="location"><span>Pickup location</span><select id="location" value={selectedLocation} onChange={(event) => setLocationId(event.target.value)}>{catalog.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field" htmlFor="pickup-start"><span>Pickup starts</span><input id="pickup-start" type="datetime-local" value={pickupStart} onChange={(event) => setPickupStart(event.target.value)} /></label>
      <label className="field" htmlFor="pickup-end"><span>Pickup ends</span><input id="pickup-end" type="datetime-local" value={pickupEnd} onChange={(event) => setPickupEnd(event.target.value)} /></label>
      <label className="field" htmlFor="join-deadline"><span>Join deadline</span><input id="join-deadline" type="datetime-local" value={joinDeadline} onChange={(event) => setJoinDeadline(event.target.value)} /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish drop"}</button>
    </form>
  );
}
