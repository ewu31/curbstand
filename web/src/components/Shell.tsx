import type { Catalog } from "../lib/types";
import type { Session } from "../lib/session";
import { placeLabel } from "../lib/format";

type ShellProps = {
  session: Session | null;
  catalog: Catalog | null;
  produce: string;
  location: string;
  query: string;
  filtering?: boolean;
  bare?: boolean;
  children: React.ReactNode;
};

function filterHref(next: { produce?: string; location?: string; q?: string }) {
  const params = new URLSearchParams();
  if (next.produce) params.set("produce", next.produce);
  if (next.location) params.set("location", next.location);
  if (next.q) params.set("q", next.q);
  const value = params.toString();
  return value ? `/?${value}` : "/";
}

export default function Shell({ session, catalog, produce, location, query, filtering = false, bare = false, children }: ShellProps) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <a className="wordmark" href="/">Curbstand</a>
        <form className="search-form" action="/" method="get">
          {produce ? <input type="hidden" name="produce" value={produce} /> : null}
          {location ? <input type="hidden" name="location" value={location} /> : null}
          <input className="search" name="q" defaultValue={query} placeholder="Search produce" aria-label="Search produce" />
        </form>
        <p className="region">Seattle · Puget Sound</p>
        <a className="button" href={session?.role === "producer" ? "/you" : "/group-buys/new"}>{session?.role === "producer" ? "Your bids" : "Create"}</a>
        {session ? (
          <a className="account" href="/you">{session.name}</a>
        ) : (
          <a className="account" href="/login">Log in</a>
        )}
      </header>
      {bare ? children : (
        <div className="frame">
          <aside className="rail" aria-label="Filters">
            <h2>Produce</h2>
            <a href={filterHref({ location, q: query })} aria-current={filtering && !produce ? "page" : undefined} aria-label="All produce">All</a>
            {catalog?.produce.map((item) => (
              <a key={item.slug} href={filterHref({ produce: item.slug, location, q: query })} aria-current={produce === item.slug ? "page" : undefined}>
                {item.displayName}
              </a>
            ))}
            <h2>Pickup</h2>
            <a href={filterHref({ produce, q: query })} aria-current={filtering && !location ? "page" : undefined} aria-label="All pickup locations">All</a>
            {catalog?.locations.map((item) => (
              <a key={item.id} href={filterHref({ produce, location: item.id, q: query })} aria-current={location === item.id ? "page" : undefined}>
                {placeLabel(item)}
              </a>
            ))}
          </aside>
          <div className="main">{children}</div>
        </div>
      )}
    </>
  );
}
