import { useState, type SubmitEvent } from "react";
import { matchDemoAccount } from "../lib/demo-accounts";
import { writeSession, readDemoAccounts, type Session } from "../lib/session";
import type { Role } from "../lib/types";
import { isDemo } from "../lib/data";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [message, setMessage] = useState<string | null>(null);

  function finish(session: Session) {
    writeSession(session);
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.assign(next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : mode === "login" ? "/" : "/you");
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (!password.trim()) {
      setMessage("Enter a password.");
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
      finish({ id: demo.id, name: demo.name, email: demo.email, role: demo.role, localOnly: false });
      return;
    }
    if (!name.trim()) {
      setMessage("Enter your name.");
      return;
    }
    if (demo) {
      finish({ id: demo.id, name: demo.name, email: demo.email, role: demo.role, localOnly: false });
      return;
    }
    if (!isDemo) {
      setMessage("Registration is not available on the API yet. Log in with a demo account to continue.");
      return;
    }
    finish({ id: crypto.randomUUID(), name: name.trim(), email: email.trim(), role, localOnly: true });
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
        <p className="hint">Demo accounts: maya@curbstand.test and jordan@curbstand.test (customers), elena@curbstand.test (producer). Use any password; this demo does not verify passwords.</p>
        {!login ? <p className="hint">{isDemo ? "New demo accounts work in this browser session only." : "New account registration is awaiting backend support. Use a demo account to explore."}</p> : null}
        <button className="button" type="submit">{login ? "Log in" : "Create account"}</button>
        <p className="switch-auth">
          {login ? <a className="inline-link" href="/register">Create account</a> : <a className="inline-link" href="/login">Log in</a>}
        </p>
      </form>
    </div>
  );
}
