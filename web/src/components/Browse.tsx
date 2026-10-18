import { useEffect, useState } from "react";
import { listGroupBuys } from "../lib/data";
import { actionError } from "../lib/api-error";
import { produceName } from "../lib/format";
import type { Catalog, GroupBuySummary } from "../lib/types";
import { recommendedDrops } from "../lib/drops";
import { placeLabel } from "../lib/format";
import ListingCard from "./ListingCard";

export default function Browse({ catalog, produce, location, query }: { catalog: Catalog | null; produce: string; location: string; query: string }) {
  const [sort, setSort] = useState("recommended");
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

  const sorted = sort === "soonest" ? [...visible].sort((a, b) => Date.parse(a.pickupWindowStart) - Date.parse(b.pickupWindowStart)) : recommendedDrops(visible);
  function filterHref(nextProduce: string) {
    const params = new URLSearchParams();
    if (nextProduce) params.set("produce", nextProduce);
    if (location) params.set("location", location);
    if (query) params.set("q", query);
    return `/?${params}`;
  }
  return (
    <>
      <section className="feed-intro">
        <p className="eyebrow">THE NEIGHBORHOOD PRODUCE MARKET</p>
        <h1>Fresh drops, close to home.</h1>
        <p>Find local produce, join a drop, and reach the minimum together.</p>
        <a href="/distributor" className="intro-link">Bring a drop to your neighborhood <span aria-hidden="true">&#8599;</span></a>
      </section>
      <div className="feed-filters">
        <nav className="produce-tabs" aria-label="Produce filters">
          <a href={filterHref("")} aria-current={!produce ? "page" : undefined}>All produce</a>
          {catalog?.produce.map(item => <a key={item.slug} href={filterHref(item.slug)} aria-current={produce === item.slug ? "page" : undefined}>{item.displayName}</a>)}
        </nav>
        <form action="/" className="location-filter">
          {produce ? <input type="hidden" name="produce" value={produce} /> : null}
          {query ? <input type="hidden" name="q" value={query} /> : null}
          <label htmlFor="pickup-filter">Pickup</label>
          <select id="pickup-filter" name="location" defaultValue={location} onChange={event => event.currentTarget.form?.requestSubmit()}>
            <option value="">All neighborhoods</option>
            {catalog?.locations.map(item => <option key={item.id} value={item.id}>{placeLabel(item)}</option>)}
          </select>
        </form>
      </div>
      <div className="feed-heading"><div><h2>Drops near you</h2><p>{sort === "recommended" ? "Drops close to their minimum come first." : "Your next pickup, first."}{rows && catalog ? ` ${visible.length} drops` : ""}</p></div>
        <label className="sort-label">Sort by <select aria-label="Sort drops" value={sort} onChange={event => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="soonest">Soonest pickup</option></select></label>
      </div>
      {error ? (
        <div className="empty">
          <p className="alert" role="alert">{error}</p>
          <button className="button secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      ) : null}
      {!error && (!catalog || rows === null) ? <p className="status-line">Loading</p> : null}
      {!error && catalog && rows && visible.length === 0 ? (
        <div className="empty">
          <p>No drops match your search.</p>
          <a className="inline-link" href="/">Clear filters</a>
        </div>
      ) : null}
      {catalog && visible.length > 0 ? (
        <div className="listing-grid">
          {sorted.map((groupBuy) => <ListingCard key={groupBuy.id} groupBuy={groupBuy} produce={catalog.produce} />)}
        </div>
      ) : null}
    </>
  );
}
