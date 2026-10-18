import { useEffect, useState } from "react";
import { listGroupBuys } from "../lib/data";
import { actionError } from "../lib/api-error";
import { produceName } from "../lib/format";
import type { Catalog, GroupBuySummary } from "../lib/types";
import ListingCard from "./ListingCard";

export default function Browse({ catalog, produce, location, query }: { catalog: Catalog | null; produce: string; location: string; query: string }) {
  const [rows, setRows] = useState<GroupBuySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);
    listGroupBuys({ produceType: produce || undefined, locationId: location || undefined })
      .then((next) => { if (active) setRows(next); })
      .catch((reason) => { if (active) setError(actionError(reason)); });
    return () => { active = false; };
  }, [produce, location, attempt]);

  const visible = (rows ?? []).filter((groupBuy) => {
    if (!query.trim() || !catalog) return !query.trim();
    const haystack = `${produceName(groupBuy.produceType, catalog.produce)} ${groupBuy.pickupLocation?.name ?? ""} ${groupBuy.pickupLocation?.address ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <>
      <h1 className="page-title">Group buys</h1>
      {error ? (
        <div className="empty">
          <p className="alert" role="alert">{error}</p>
          <button className="button secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      ) : null}
      {!error && (!catalog || rows === null) ? <p className="status-line">Loading</p> : null}
      {!error && catalog && rows && visible.length === 0 ? (
        <div className="empty">
          <p>No group buys match.</p>
          <a className="inline-link" href="/group-buys/new">Create a group buy</a>
        </div>
      ) : null}
      {catalog && visible.length > 0 ? (
        <div className="listing-grid">
          {visible.map((groupBuy) => <ListingCard key={groupBuy.id} groupBuy={groupBuy} produce={catalog.produce} />)}
        </div>
      ) : null}
    </>
  );
}
