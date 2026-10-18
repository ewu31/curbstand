import { useEffect, useState } from "react";
import { listMine } from "../lib/data";
import { actionError } from "../lib/api-error";
import { clearSession, type Session } from "../lib/session";
import type { Catalog, GroupBuySummary } from "../lib/types";
import ListingCard from "./ListingCard";

export default function Yours({ catalog, session }: { catalog: Catalog | null; session: Session | null }) {
  const [created, setCreated] = useState<GroupBuySummary[] | null>(null);
  const [joined, setJoined] = useState<GroupBuySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session?.id) return;
    let active = true;
    setError(null);
    listMine(session.id)
      .then((mine) => {
        if (!active) return;
        setCreated(mine.created);
        setJoined(mine.joined);
      })
      .catch((reason) => { if (active) setError(actionError(reason)); });
    return () => { active = false; };
  }, [session?.id, session?.role, attempt]);

  function logout() {
    clearSession();
    window.location.assign("/");
  }

  if (!session) {
    return (
      <div className="form-panel">
        <h1>Your drops</h1>
        <p>Log in to see group buys you published or committed to.</p>
        <a className="button" href="/login">Log in</a>
      </div>
    );
  }

  return (
    <div className="yours">
      <h1 className="page-title">Your drops</h1>
      <div className="actions pad-x">
        <button className="text-button" type="button" onClick={logout}>Log out</button>
        <button className="text-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Refresh</button>
      </div>
      {session.localOnly ? <p className="hint pad-x">Demo account · Your activity is saved in this browser tab.</p> : null}
      {error ? <p className="alert pad-x" role="alert">{error}</p> : null}
      {!error && session.role === "customer" ? <>
      <Section title="Created" rows={session.id ? created : []} produce={catalog?.produce ?? []} />
      <Section title="Joined" rows={session.id ? joined : []} produce={catalog?.produce ?? []} />
      </> : null}
      {!error && session.role === "producer" ? <>
      <a className="button" href="/group-buys/new">Create a drop</a>
      <Section title="Your published drops" rows={session.id ? created : []} produce={catalog?.produce ?? []} />
      </> : null}
    </div>
  );
}

function Section({ title, rows, produce }: { title: string; rows: GroupBuySummary[] | null; produce: Catalog["produce"] }) {
  return (
    <section>
      <h2>{title}</h2>
      {rows === null ? <p className="status-line">Loading</p> : null}
      {rows && rows.length === 0 ? <p className="empty">Nothing here yet.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="listing-grid">
          {rows.map((groupBuy) => <ListingCard key={`${title}-${groupBuy.id}`} groupBuy={groupBuy} produce={produce} />)}
        </div>
      ) : null}
    </section>
  );
}
