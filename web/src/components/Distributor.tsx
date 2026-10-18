import type { Catalog } from "../lib/types";
import type { Session } from "../lib/session";
import CreateGroupBuy from "./CreateGroupBuy";
export default function Distributor({ catalog, session }: { catalog: Catalog | null; session: Session | null }) {
  return <div className="distributor-page"><section className="distributor-intro"><p className="eyebrow">DISTRIBUTOR SPACE</p><h1>Good food starts<br />with a neighbor.</h1><p>Organize a drop for your community. Choose the produce, set a minimum, and bring everyone together at one pickup.</p><ol><li><strong>Set up your drop</strong><span>Choose what, where, and when.</span></li><li><strong>Build the order together</strong><span>Set your price per pound. Neighbors commit to a quantity.</span></li><li><strong>Make pickup happen</strong><span>Once your minimum is met, the pickup date is automatically confirmed.</span></li></ol><a className="inline-link" href="/you">Manage your drops &rarr;</a></section><div><CreateGroupBuy catalog={catalog} session={session} /></div></div>;
}
