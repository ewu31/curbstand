import { useEffect, useState, type SubmitEvent } from "react";
import { matchDemoAccount } from "../lib/demo-accounts";
import { writeSession, readDemoAccounts, type Session } from "../lib/session";
import type { Role } from "../lib/types";
import { login as apiLogin, signup, getCatalog } from "../lib/api";
import { isDemo } from "../lib/data";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [producerType, setProducerType] = useState<NonNullable<Session["producerType"]>>("local_farmer");
  const [farmName, setFarmName] = useState("");
  const [produceTypes, setProduceTypes] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<{ slug: string; displayName: string }[]>([]);
  const [radius, setRadius] = useState("80");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [orgType, setOrgType] = useState<"individual" | "restaurant">("individual");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isDemo && mode === "register") getCatalog().then(c => setCatalog(c.produce)).catch(() => setMessage("Could not load produce types. Refresh to try again."));
  }, [mode]);
  const [message, setMessage] = useState<string | null>(null);

  function finish(session: Session) {
    writeSession(session);
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.assign(next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : mode === "login" ? "/" : "/you");
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (!password.trim()) {
      setMessage("Enter a password.");
      return;
    }
    if (!isDemo) {
      setBusy(true);
      setMessage(null);
      try {
        const common = { email: email.trim(), password, name: name.trim() };
        const result = mode === "login" ? await apiLogin(common.email, password) : await signup(role === "customer"
          ? { ...common, role, orgType }
          : { ...common, role, farmName, producerType, produceTypes, serviceRadiusMiles: Number(radius), farmLatitude: latitude.trim() ? Number(latitude) : NaN, farmLongitude: longitude.trim() ? Number(longitude) : NaN });
        finish({ id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role, token: result.token, producerType: result.user.producerProfile?.producerType, photoUrl: result.user.photoUrl || "/avatars/guest.svg", localOnly: false });
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not sign in."); }
      finally { setBusy(false); }
      return;
    }
    const demo = matchDemoAccount(email);
    const existing = isDemo ? readDemoAccounts().find((account) => account.email.toLowerCase() === email.trim().toLowerCase()) : undefined;
    if (existing) {
      finish(existing);
      return;
    }
    if (mode === "login") {
      if (!demo) {
        setMessage("No seeded account uses that email.");
        return;
      }
      finish({ id: demo.id, name: demo.name, email: demo.email, role: demo.role, photoUrl: demo.photoUrl, localOnly: false });
      return;
    }
    if (!name.trim()) {
      setMessage("Enter your name.");
      return;
    }
    if (demo) {
      finish({ id: demo.id, name: demo.name, email: demo.email, role: demo.role, photoUrl: demo.photoUrl, localOnly: false });
      return;
    }
    if (!isDemo) {
      setMessage("Registration is not available on the API yet. Log in with a demo account to continue.");
      return;
    }
    finish({ id: crypto.randomUUID(), name: name.trim(), email: email.trim(), role, producerType: role === "producer" ? producerType : undefined, photoUrl: "/avatars/guest.svg", localOnly: true });
  }

  const login = mode === "login";
  return (
    <div className="auth-wrap">
      <form className="form-panel auth-card" onSubmit={submit} noValidate>
        <h1>{login ? "Log in" : "Create account"}</h1>
        {message ? <p className="alert" role="alert">{message}</p> : null}
        {login ? null : (
          <label className="field" htmlFor="name">
            <span>Name</span>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="field" htmlFor="email">
          <span>Email</span>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
        </label>
        <label className="field" htmlFor="password">
          <span>Password</span>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={login ? "current-password" : "new-password"} />
        </label>
        {login ? null : (
          <fieldset className="choices">
            <legend>Role</legend>
            <div>
              <label><input type="radio" name="role" value="customer" checked={role === "customer"} onChange={() => setRole("customer")} /> Customer</label>
              <label><input type="radio" name="role" value="producer" checked={role === "producer"} onChange={() => setRole("producer")} /> Producer</label>
            </div>
          </fieldset>
        )}
        {!login && !isDemo && role === "customer" ? <label className="field"><span>Account type</span><select value={orgType} onChange={e => setOrgType(e.target.value as typeof orgType)}><option value="individual">Individual</option><option value="restaurant">Restaurant</option></select></label> : null}
        {!login && role === "producer" ? <label className="field"><span>Producer type</span><select value={producerType} onChange={e => setProducerType(e.target.value as typeof producerType)}><option value="at_home">At home</option><option value="local_farmer">Local farmer</option><option value="large_scale_farmer">Large scale farmer</option></select></label> : null}
        {!login && !isDemo && role === "producer" ? <>
          <label className="field"><span>Farm name</span><input value={farmName} onChange={e => setFarmName(e.target.value)} /></label>
          <fieldset className="choices"><legend>Produce you grow</legend>{catalog.map(p => <label key={p.slug}><input type="checkbox" checked={produceTypes.includes(p.slug)} onChange={e => setProduceTypes(e.target.checked ? [...produceTypes, p.slug] : produceTypes.filter(id => id !== p.slug))} />{p.displayName}</label>)}</fieldset>
          <label className="field"><span>Service radius (miles, 1–250)</span><input type="number" min="1" max="250" value={radius} onChange={e => setRadius(e.target.value)} /></label>
          <label className="field"><span>Farm latitude</span><input type="number" step="any" min="-90" max="90" value={latitude} onChange={e => setLatitude(e.target.value)} /></label>
          <label className="field"><span>Farm longitude</span><input type="number" step="any" min="-180" max="180" value={longitude} onChange={e => setLongitude(e.target.value)} /></label>
        </> : null}
        <p className="hint">{isDemo ? "Demo accounts: maya@curbstand.test and jordan@curbstand.test (customers), elena@curbstand.test (producer). Use any password; this demo does not verify passwords." : "Seeded accounts: alice@demo.curbstand.app (customer), farmer.joe@demo.curbstand.app (producer). Password: password123."}</p>
        {!login ? <p className="hint">{isDemo ? "New demo accounts work in this browser session only." : "Use a password with at least 8 characters."}</p> : null}
        <button className="button" type="submit" disabled={busy}>{busy ? "Please wait…" : login ? "Log in" : "Create account"}</button>
        <p className="switch-auth">
          {login ? <a className="inline-link" href="/register">Create account</a> : <a className="inline-link" href="/login">Log in</a>}
        </p>
      </form>
    </div>
  );
}
