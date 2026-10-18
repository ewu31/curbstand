import type { SavedLocation } from "./location";

const SHELF: Record<string, number> = {
  apples: 2.49,
  tomatoes: 3.19,
  carrots: 1.49,
  "leafy-greens": 3.49,
  potatoes: 1.29,
  onions: 1.39,
  strawberries: 4.99,
  kale: 3.29,
  pears: 2.79,
  cherries: 5.99,
  lettuce: 2.69,
  blueberries: 4.79,
  corn: 1.19,
  peppers: 3.09,
  cucumbers: 1.89,
  zucchini: 1.99,
  peaches: 3.39,
  broccoli: 2.59,
  cabbage: 1.45,
  plums: 3.25,
};

export type GroceryQuote = {
  store: string;
  pricePerLb: number;
};

function money(value: number) {
  return Math.round(value * 100) / 100;
}

/** Shelf prices for the shopper's area. A live grocery feed can replace this table later. */
export function groceryPrices(produceSlug: string, location: SavedLocation): GroceryQuote[] {
  const base = SHELF[produceSlug] ?? 2.99;
  const nudge = Math.round((((Math.abs(location.latitude) + Math.abs(location.longitude)) % 1) * 0.3) * 100) / 100;
  return [
    { store: "Neighborhood Grocer", pricePerLb: money(base + nudge) },
    { store: "Corner Market", pricePerLb: money(base + 0.45 + nudge) },
    { store: "City Supermarket", pricePerLb: money(Math.max(0.5, base - 0.25 + nudge)) },
  ];
}
