import { useEffect, useState, type SubmitEvent } from "react";
import { actionError } from "../lib/api-error";
import { getGroupBuy, joinGroupBuy } from "../lib/data";
import { perLb, produceName, producePhoto, usd } from "../lib/format";
import type { Catalog, GroupBuyDetail } from "../lib/types";
import type { Session } from "../lib/session";

export default function Purchase({ id, catalog, session }: { id: string; catalog: Catalog | null; session: Session | null }) {
  const [groupBuy, setGroupBuy] = useState<GroupBuyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pounds, setPounds] = useState("10");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getGroupBuy(id)
      .then((next) => { if (active) setGroupBuy(next); })
      .catch((reason) => { if (active) setError(actionError(reason)); });
    return () => { active = false; };
  }, [id]);

  if (error) {
    return (
      <div className="empty">
        <h1 className="page-title">Purchase</h1>
        <p className="alert" role="alert">{error}</p>
        <a className="inline-link" href={`/group-buys/${id}`}>Back to the drop</a>
      </div>
    );
  }
  if (!groupBuy || !catalog) return <p className="status-line">Loading</p>;

  const name = produceName(groupBuy.produceType, catalog.produce);
  const photo = producePhoto(groupBuy.produceType);
  const price = groupBuy.pricePerLb ?? 0;
  const total = usd(Math.round(Number(pounds) * price * 100) / 100 || 0);
  const mine = session?.id ? groupBuy.participants.some((person) => person.userId === session.id) : false;

  async function skip(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedLbs = Number(pounds);
    if (!session?.id) return;
    if (!Number.isFinite(requestedLbs) || !(requestedLbs > 0)) {
      setMessage("Enter pounds above 0.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await joinGroupBuy(id, requestedLbs, session.id);
      window.location.assign(`/group-buys/${id}`);
    } catch (reason) {
      setMessage(actionError(reason));
      setBusy(false);
    }
  }

  return (
    <article className="purchase-page">
      <a className="inline-link" href={`/group-buys/${id}`}>Back to the drop</a>
      <div className="form-panel">
        <p className="eyebrow">PURCHASE</p>
        <h1>{name}</h1>
        <img className="purchase-photo" src={photo} alt="" />
        <p>{perLb(price)} from {groupBuy.seller?.name || "the grower"}</p>
        <section className="info-panel">
          <h2>Payment comes later</h2>
          <p>Checkout is not connected yet. You can skip this step and record the quantity with no charge.</p>
        </section>
        {!session ? <p className="hint"><a className="inline-link" href={`/login?next=${encodeURIComponent(`/group-buys/${id}/purchase`)}`}>Log in to purchase</a></p> : null}
        {session && session.role !== "customer" ? <p className="hint">Producer accounts publish drops. A customer account can purchase.</p> : null}
        {mine ? <p className="hint">You already joined this drop.</p> : null}
        {session?.role === "customer" && !mine ? (
          <form className="stack" onSubmit={skip} noValidate>
            <label className="field">
              <span>Pounds</span>
              <input inputMode="decimal" value={pounds} onChange={(event) => setPounds(event.target.value)} aria-label="Pounds" />
            </label>
            {message ? <p className="alert" role="alert">{message}</p> : null}
            <p className="commit-total">Order total: {total}</p>
            <fieldset className="payment-later" disabled>
              <legend>Card payment</legend>
              <p>Card, bank, and wallet checkout will be connected here.</p>
            </fieldset>
            <div className="actions">
              <button className="button" type="submit" disabled={busy}>{busy ? "Please wait…" : "Skip for now"}</button>
              <a className="inline-link" href={`/group-buys/${id}`}>Leave without purchasing</a>
            </div>
          </form>
        ) : null}
      </div>
    </article>
  );
}
