import { useEffect, useState, type SubmitEvent } from "react";
import { writeSession, type Session } from "../lib/session";
import { getProfile, updateProfile } from "../lib/api";
import { isDemo } from "../lib/data";
import LocationSettings from "./LocationSettings";

type ProducerType = NonNullable<Session["producerType"]>;

const PRODUCER_TYPE_LABELS: Record<ProducerType, string> = {
  at_home: "At home",
  local_farmer: "Local farmer",
  large_scale_farmer: "Large scale farmer",
};

export default function AccountPage({ session, payments = false }: { session: Session | null; payments?: boolean }) {
  return <section className="account-page"><p className="eyebrow">YOUR ACCOUNT</p><h1>{payments ? "Payment methods" : "Profile"}</h1>
    {!session ? <><p>Log in to view your {payments ? "payment information" : "profile"}.</p><a className="button" href={`/login?next=${payments ? "/payment-methods" : "/profile"}`}>Log in</a></> : payments ? <><p>No payment methods are saved.</p><div className="info-panel"><h2>Payments at Curbstand</h2><p>Online payments are not available yet. Joining a drop records a deposit intent; it does not charge you. Coordinate payment with your drop organizer.</p></div><a className="inline-link" href="/you">View your orders</a></> : <><img className="profile-photo" src={session.photoUrl || "/avatars/guest.svg"} alt="" />{session.role === "producer" ? <ProducerSettings session={session} /> : <><ProfileDetails session={session} /><a className="inline-link" href="/register">Create a producer account</a></>}<LocationSettings /></>}
  </section>;
}

function ProfileDetails({ session, producerType }: { session: Session; producerType?: ProducerType }) {
  return <dl className="profile-details"><dt>Name</dt><dd>{session.name}</dd><dt>Email</dt><dd>{session.email}</dd><dt>Account type</dt><dd>{session.role === "customer" ? "Produce buyer" : "Producer"}</dd>{producerType ? <><dt>Producer type</dt><dd>{PRODUCER_TYPE_LABELS[producerType]}</dd></> : null}</dl>;
}

function ProducerSettings({ session }: { session: Session }) {
  const [type, setType] = useState<ProducerType>(session.producerType ?? "local_farmer");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(!isDemo);
  const [loaded, setLoaded] = useState(isDemo);
  useEffect(() => {
    if (isDemo) return;
    let active = true;
    getProfile().then(({ user }) => { if (active) { setType(user.producerProfile?.producerType ?? "local_farmer"); setLoaded(true); } }).catch(() => { if (active) setMessage("Could not load your profile. Refresh to try again."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { if (!isDemo) await updateProfile(type); writeSession({ ...session, producerType: type }); setMessage("Producer type saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save your profile."); }
    finally { setBusy(false); }
  }
  return <><ProfileDetails session={session} producerType={type} /><form className="stack" onSubmit={save}><label className="field"><span>Producer type</span><select value={type} onChange={e => setType(e.target.value as ProducerType)} disabled={busy || !loaded}><option value="at_home">At home</option><option value="local_farmer">Local farmer</option><option value="large_scale_farmer">Large scale farmer</option></select></label><p className="hint">At home is produce from a garden or backyard. Local farmer is produce from a nearby farm. Large scale farmer is produce from a larger farm.</p><button className="button" disabled={busy || !loaded}>Save producer type</button><p role="status">{message}</p></form></>;
}
