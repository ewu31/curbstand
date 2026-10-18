import { useEffect, useRef } from "react";
import { clearSession, type Session } from "../lib/session";
import type { Catalog } from "../lib/types";
type ShellProps = { session: Session | null; catalog: Catalog | null; produce: string; location: string; query: string; filtering?: boolean; bare?: boolean; children: React.ReactNode };
export default function Shell({ session, produce, location, query, bare = false, children }: ShellProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.removeAttribute("open"); menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <header className="topbar">
      <a className="wordmark" href="/"><img className="brand-bag" src="/brand/bag.svg" alt="" />Curbstand</a>
      <form className="search-form" action="/" method="get">
        {produce ? <input type="hidden" name="produce" value={produce} /> : null}
        {location ? <input type="hidden" name="location" value={location} /> : null}
        <input className="search" name="q" defaultValue={query} placeholder="Find something fresh" aria-label="Search produce" />
      </form>
      <details className="account-menu" ref={menu}>
        <summary aria-label="Account menu"><img className="account-avatar" src={session?.photoUrl || "/avatar.svg"} alt="" /></summary>
        <nav className="menu-panel" aria-label="Account">
          <p>{session?.name || "Welcome to Curbstand"}<small>{session?.email || "Good food, closer to home."}</small></p>
          <a href="/profile">Profile</a><a href="/following">Following & followers</a><a href="/you">Orders</a><a href="/payment-methods">Payment methods</a>
          <a className="distributor-link" href="/distributor">Become a distributor <span aria-hidden="true">&#8599;</span></a>
          {session ? <button onClick={() => { clearSession(); window.location.assign("/"); }}>Log out</button> : <a href="/login">Log in / Sign up</a>}
        </nav>
      </details>
    </header>
    <div className={bare ? "" : "frame"}><div className="main">{children}</div></div>
    <footer className="site-footer">
      <div className="footer-main"><div className="footer-brand"><a className="wordmark" href="/"><img className="brand-bag" src="/brand/bag.svg" alt="" />Curbstand</a><p>Fresh food. Shared orders.<br />Stronger local communities.</p><span>Serving Seattle &amp; Puget Sound</span></div>
      <nav aria-label="Produce"><h2>Produce</h2><a href="/">All produce</a><a href="/you">Your orders</a><a href="/distributor">Organize a drop</a></nav>
      <nav aria-label="Your account"><h2>Your account</h2><a href="/profile">Profile</a><a href="/payment-methods">Payment information</a><a href="/register">Join the community</a></nav>
      <div className="footer-promise"><h2>Local food, made simple</h2><p>Choose your quantity at the producer's price. When the minimum is reached, your pickup date is confirmed.</p></div></div>
      <div className="footer-bottom"><span>&copy; {new Date().getFullYear()} Curbstand. All rights reserved.</span><span>Grown nearby. Brought together.</span></div>
    </footer>
  </>;
}
