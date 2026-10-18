// Controlled demo catalog (Seattle / Puget Sound). The API seeds these into the
// database; ids are stable slugs used as foreign keys and filter values.

export interface ProduceTypeSeed {
  id: string;
  name: string;
  category: "vegetable" | "fruit" | "leafy_green";
}

export const PRODUCE_TYPES: readonly ProduceTypeSeed[] = [
  { id: "apples", name: "Apples", category: "fruit" },
  { id: "pears", name: "Pears", category: "fruit" },
  { id: "cherries", name: "Cherries", category: "fruit" },
  { id: "strawberries", name: "Strawberries", category: "fruit" },
  { id: "tomatoes", name: "Tomatoes", category: "vegetable" },
  { id: "potatoes", name: "Potatoes", category: "vegetable" },
  { id: "onions", name: "Onions", category: "vegetable" },
  { id: "carrots", name: "Carrots", category: "vegetable" },
  { id: "lettuce", name: "Lettuce", category: "leafy_green" },
  { id: "kale", name: "Kale", category: "leafy_green" },
];

export const PRODUCE_TYPE_IDS = PRODUCE_TYPES.map((p) => p.id);

export interface PickupLocationSeed {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  latitude: number;
  longitude: number;
}

/** Approved public pickup locations. Coordinates are approximate demo values. */
export const PICKUP_LOCATIONS: readonly PickupLocationSeed[] = [
  { id: "ballard-commons", name: "Ballard Commons Park", neighborhood: "Ballard", city: "Seattle", latitude: 47.6685, longitude: -122.385 },
  { id: "northgate-station", name: "Northgate Station", neighborhood: "Northgate", city: "Seattle", latitude: 47.7031, longitude: -122.3283 },
  { id: "capitol-hill-station", name: "Capitol Hill Station", neighborhood: "Capitol Hill", city: "Seattle", latitude: 47.6194, longitude: -122.3205 },
  { id: "columbia-city-station", name: "Columbia City Station", neighborhood: "Columbia City", city: "Seattle", latitude: 47.5597, longitude: -122.2925 },
  { id: "bellevue-downtown-park", name: "Bellevue Downtown Park", neighborhood: "Downtown", city: "Bellevue", latitude: 47.6127, longitude: -122.2053 },
  { id: "redmond-downtown-park", name: "Redmond Downtown Park", neighborhood: "Downtown", city: "Redmond", latitude: 47.674, longitude: -122.125 },
  { id: "tukwila-intl-blvd-station", name: "Tukwila International Blvd Station", neighborhood: "Tukwila", city: "Tukwila", latitude: 47.4642, longitude: -122.288 },
];

/** Great-circle distance in miles, for producer service-radius matching. */
export function distanceMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type IneligibleReason = "produce_type" | "service_radius";

/**
 * Whether a producer may bid on a group buy: they grow the produce type and the
 * pickup location is within their service radius of the farm.
 */
export function producerEligibility(
  producer: { produceTypes: readonly string[]; serviceRadiusMiles: number; farmLatitude: number; farmLongitude: number },
  groupBuy: { produceTypeId: string; pickupLocation: { latitude: number; longitude: number } },
): { eligible: boolean; reasons: IneligibleReason[]; distanceMiles: number } {
  const miles = distanceMiles({ latitude: producer.farmLatitude, longitude: producer.farmLongitude }, groupBuy.pickupLocation);
  const reasons: IneligibleReason[] = [];
  if (!producer.produceTypes.includes(groupBuy.produceTypeId)) reasons.push("produce_type");
  if (miles > producer.serviceRadiusMiles) reasons.push("service_radius");
  return { eligible: reasons.length === 0, reasons, distanceMiles: Math.round(miles * 10) / 10 };
}
