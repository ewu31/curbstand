import { useEffect, useState, type SubmitEvent } from "react";
import { currentPosition, readLocation, writeLocation } from "../lib/location";

export default function LocationSettings() {
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = readLocation();
    if (saved) setLabel(saved.label);
  }, []);

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const place = label.trim();
    if (!place) {
      setMessage("Enter a neighborhood or city.");
      return;
    }
    const saved = readLocation();
    writeLocation({
      label: place,
      latitude: saved && saved.label === place ? saved.latitude : 47.606,
      longitude: saved && saved.label === place ? saved.longitude : -122.332,
    });
    setMessage("Location saved.");
  }

  async function useBrowser() {
    setBusy(true);
    setMessage("");
    try {
      const next = await currentPosition();
      writeLocation(next);
      setLabel(next.label);
      setMessage("Using your browser location.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Location access was blocked.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="location" className="stack location-settings" onSubmit={save}>
      <h2>Location</h2>
      <p className="hint">Grocery prices on a drop use this place, or the location your browser shares.</p>
      <label className="field">
        <span>Neighborhood or city</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} autoComplete="address-level2" />
      </label>
      <div className="actions">
        <button className="button" type="submit">Save location</button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => void useBrowser()}>Use browser location</button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
