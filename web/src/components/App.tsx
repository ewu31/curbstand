import { useEffect, useState } from "react";
import { actionError } from "../lib/api-error";
import { getCatalog } from "../lib/data";
import { readSession, type Session } from "../lib/session";
import type { Catalog } from "../lib/types";
import AuthForm from "./AuthForm";
import Browse from "./Browse";
import CreateGroupBuy from "./CreateGroupBuy";
import Detail from "./Detail";
import Shell from "./Shell";
import Yours from "./Yours";

type AppProps = {
  page: string;
  groupBuyId?: string;
  produce?: string;
  location?: string;
  query?: string;
};

export default function App({ page, groupBuyId = "", produce = "", location = "", query = "" }: AppProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
    const titles: Record<string, string> = {
      browse: "Curbstand",
      detail: "Group buy · Curbstand",
      create: "Create a group buy · Curbstand",
      yours: "Your group buys · Curbstand",
      login: "Log in · Curbstand",
      register: "Create account · Curbstand",
      "not-found": "Page not found · Curbstand",
    };
    document.title = titles[page] ?? "Curbstand";
  }, [page]);

  useEffect(() => {
    let active = true;
    setCatalogError(null);
    getCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setCatalogError(actionError(reason)); });
    return () => { active = false; };
  }, [attempt]);

  const bare = page === "login" || page === "register";
  const showPage = !catalogError || bare || page === "not-found";
  return (
    <Shell session={session} catalog={catalog} produce={produce} location={location} query={query} filtering={page === "browse"} bare={bare}>
      <main id="main" tabIndex={-1}>
        {catalogError && !bare && page !== "not-found" ? (
          <div className="empty">
            <p className="alert" role="alert">{catalogError}</p>
            <button className="button secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
          </div>
        ) : null}
        {showPage && page === "browse" ? <Browse catalog={catalog} produce={produce} location={location} query={query} /> : null}
        {showPage && page === "detail" ? <Detail id={groupBuyId} catalog={catalog} session={session} /> : null}
        {showPage && page === "create" ? <CreateGroupBuy catalog={catalog} session={session} /> : null}
        {showPage && page === "yours" ? <Yours catalog={catalog} session={session} /> : null}
        {page === "login" || page === "register" ? ready ? <AuthForm mode={page} /> : <p className="status-line" role="status">Loading</p> : null}
        {page === "not-found" ? (
          <div className="empty">
            <h1 className="page-title">This page is not here</h1>
            <a className="inline-link" href="/">Back to group buys</a>
          </div>
        ) : null}
      </main>
    </Shell>
  );
}
