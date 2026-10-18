const KEY = "curbstand.location";

export type SavedLocation = {
  label: string;
  latitude: number;
  longitude: number;
};

export function readLocation(): SavedLocation | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as SavedLocation | null;
    if (!parsed || typeof parsed.label !== "string") return null;
    if (!Number.isFinite(parsed.latitude) || !Number.isFinite(parsed.longitude)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocation(location: SavedLocation) {
  localStorage.setItem(KEY, JSON.stringify(location));
  window.dispatchEvent(new Event("curbstand-location"));
}

export function currentPosition(): Promise<SavedLocation> {
  if (!navigator.geolocation) return Promise.reject(new Error("This browser cannot share a location."));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          label: "Current location",
          latitude: Math.round(position.coords.latitude * 1000) / 1000,
          longitude: Math.round(position.coords.longitude * 1000) / 1000,
        });
      },
      () => reject(new Error("Location access was blocked. Set a place in settings instead.")),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
