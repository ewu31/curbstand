import { useEffect, useState } from "react";
import { groceryPrices } from "../lib/grocery-prices";
import { currentPosition, readLocation, writeLocation, type SavedLocation } from "../lib/location";
import { perLb } from "../lib/format";

export default function GroceryPrices({ produceSlug }: { produceSlug: string }) {
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    sync();
    window.addEventListener("curbstand-location", sync);
    return () => window.removeEventListener("curbstand-location", sync);
  }, []);

  async function useBrowser() {
    setBusy(true);
    setMessage("");
    try {
      const next = await currentPosition();
      writeLocation(next);
      setLocation(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Location access was blocked. Set a place in settings instead.");
    } finally {
      setBusy(false);
    }
  }

  const quotes = location ? groceryPrices(produceSlug, location) : [];
  return (
    <section className="grocery-prices" aria-label="Grocery prices around you">
      <h2>Grocery prices around you</h2>
      {location ? (
        <>
          <p className="hint">Shelf prices for this produce near {location.label}. A live grocery feed will replace this comparison.</p>
          <table>
            <thead><tr><th>Store</th><th>Price</th></tr></thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.store}><td>{quote.store}</td><td>{perLb(quote.pricePerLb)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>Share your location to compare this drop with grocery prices nearby.</p>
      )}
      <div className="actions">
        <button className="button secondary" type="button" disabled={busy} onClick={() => void useBrowser()}>Use browser location</button>
        <a className="inline-link" href="/profile#location">Set location in settings</a>
      </div>
      {message ? <p className="hint" role="status">{message}</p> : null}
    </section>
  );
}
