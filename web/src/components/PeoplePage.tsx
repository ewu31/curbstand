import { useEffect, useState } from "react";
import { followerIds, followingIds } from "../lib/follows";
import { findPerson, type Person } from "../lib/people";
import { readDemoAccounts, type Session } from "../lib/session";

const labels = { at_home: "At home", local_farmer: "Local farmer", large_scale_farmer: "Large scale farmer" };

function lookup(id: string): Person | null {
  const known = findPerson(id);
  if (known) return known;
  const account = readDemoAccounts().find((item) => item.id === id);
  if (!account?.id) return null;
  return { id: account.id, name: account.name, photoUrl: account.photoUrl || "/avatars/guest.svg", role: account.role };
}

function PersonList({ title, ids, empty }: { title: string; ids: string[]; empty: string }) {
  const people = ids.map(lookup).filter((person): person is Person => Boolean(person));
  return (
    <section className="section">
      <h2>{title}</h2>
      {people.length === 0 ? <p className="hint">{empty}</p> : (
        <ul className="person-list">
          {people.map((person) => (
            <li key={person.id}>
              <img src={person.photoUrl} alt="" />
              <div>
                <strong>{person.farmName ?? person.name}</strong>
                <span>{person.producerType ? labels[person.producerType] : person.role === "producer" ? "Producer" : "Produce buyer"}{person.farmName ? ` · ${person.name}` : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function PeoplePage({ session }: { session: Session | null }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const sync = () => setVersion((value) => value + 1);
    window.addEventListener("curbstand-follows", sync);
    return () => window.removeEventListener("curbstand-follows", sync);
  }, []);
  if (!session?.id) {
    return (
      <section className="account-page">
        <p className="eyebrow">YOUR PEOPLE</p>
        <h1>Following & followers</h1>
        <p>Log in to see the producers you follow and the people who follow you.</p>
        <a className="button" href="/login?next=/following">Log in</a>
      </section>
    );
  }
  void version;
  return (
    <section className="account-page">
      <p className="eyebrow">YOUR PEOPLE</p>
      <h1>Following & followers</h1>
      <PersonList title="Following" ids={followingIds(session.id)} empty="You are not following any producers yet. Open a drop and follow the grower." />
      <PersonList title="Followers" ids={followerIds(session.id)} empty="No one is following you yet." />
    </section>
  );
}
