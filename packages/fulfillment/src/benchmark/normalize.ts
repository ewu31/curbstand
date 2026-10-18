import { REGION, type Region } from "../types"

export type ProduceType = {
  id: string
  label: string
}

const CATALOG: Array<ProduceType & { aliases: string[] }> = [
  { id: "apples", label: "Apples", aliases: ["apple"] },
  { id: "blueberries", label: "Blueberries", aliases: ["blueberry"] },
  { id: "carrots", label: "Carrots", aliases: ["carrot"] },
  { id: "kale", label: "Kale", aliases: [] },
  { id: "leafy-greens", label: "Leafy greens", aliases: ["leafy greens"] },
  { id: "lettuce", label: "Lettuce", aliases: [] },
  { id: "potatoes", label: "Potatoes", aliases: ["potato"] },
  { id: "strawberries", label: "Strawberries", aliases: ["strawberry"] },
  { id: "tomatoes", label: "Tomatoes", aliases: ["tomato"] },
]

const REGION_ALIASES = new Set([
  "seattle-puget-sound",
  "seattle",
  "puget sound",
  "puget-sound",
  "seattle / puget sound",
])

export function normalizeProduce(value: string | null | undefined): ProduceType | null {
  if (!value) return null
  const key = value.trim().toLowerCase().replace(/\s+/g, " ")
  const match = CATALOG.find((produce) => produce.id === key || produce.aliases.includes(key))
  return match ? { id: match.id, label: match.label } : null
}

export function normalizeRegion(value: string | null | undefined): Region | null {
  if (!value || !value.trim()) return REGION
  const key = value.trim().toLowerCase().replace(/\s+/g, " ")
  return REGION_ALIASES.has(key) ? REGION : null
}

export function produceLabel(produceType: string): string {
  return normalizeProduce(produceType)?.label ?? produceType
}
