import { produceLabel } from "./normalize"
import { parseMoneyToCents } from "../money"
import type { PriceBenchmarkResponse } from "./service"

export type ComparisonView =
  | { kind: "hidden" }
  | {
      kind: "ready"
      produceLabel: string
      groupBuyCents: number | null
      supermarket:
        | {
            state: "available"
            source: "gemini" | "demo_sample"
            lowCents: number
            highCents: number
            retrievedAt: string
            placement: "below" | "inside" | "above" | "no-bid"
            markerPercent: number | null
          }
        | { state: "unavailable"; lastSuccessfulRetrievedAt: string | null }
      uplift: { state: "hidden" } | { state: "shown"; deltaCents: number; direction: "more" | "less" | "same"; baselineCents: number }
    }

function markerPercent(price: number, low: number, high: number): number {
  if (high === low) return 50
  const raw = ((price - low) / (high - low)) * 100
  return Math.min(100, Math.max(0, raw))
}

export function deriveComparison(input: {
  produceType: string
  groupBuyPricePerLb: string | null
  benchmark: PriceBenchmarkResponse
  now: Date
}): ComparisonView {
  if (!input.benchmark.enabled) return { kind: "hidden" }

  const groupBuyCents = input.groupBuyPricePerLb ? parseMoneyToCents(input.groupBuyPricePerLb) : null
  const baselineCents = input.benchmark.distributionBaselinePerLb
    ? parseMoneyToCents(input.benchmark.distributionBaselinePerLb)
    : null
  const uplift =
    groupBuyCents === null || baselineCents === null
      ? ({ state: "hidden" } as const)
      : {
          state: "shown" as const,
          deltaCents: groupBuyCents - baselineCents,
          direction:
            groupBuyCents === baselineCents ? ("same" as const) : groupBuyCents > baselineCents ? ("more" as const) : ("less" as const),
          baselineCents,
        }

  if (input.benchmark.status === "unavailable") {
    return {
      kind: "ready",
      produceLabel: produceLabel(input.benchmark.produceType ?? input.produceType),
      groupBuyCents,
      supermarket: {
        state: "unavailable",
        lastSuccessfulRetrievedAt: input.benchmark.lastSuccessfulRetrievedAt,
      },
      uplift,
    }
  }

  const lowCents = parseMoneyToCents(input.benchmark.retailLow)
  const highCents = parseMoneyToCents(input.benchmark.retailHigh)
  const fresh = new Date(input.benchmark.expiresAt).getTime() > input.now.getTime()
  if (lowCents === null || highCents === null || lowCents <= 0 || highCents < lowCents || !fresh) {
    return {
      kind: "ready",
      produceLabel: input.benchmark.produceLabel,
      groupBuyCents,
      supermarket: {
        state: "unavailable",
        lastSuccessfulRetrievedAt: input.benchmark.retrievedAt,
      },
      uplift,
    }
  }

  let placement: "below" | "inside" | "above" | "no-bid" = "no-bid"
  let marker: number | null = null
  if (groupBuyCents !== null) {
    marker = markerPercent(groupBuyCents, lowCents, highCents)
    placement = groupBuyCents < lowCents ? "below" : groupBuyCents > highCents ? "above" : "inside"
  }

  return {
    kind: "ready",
    produceLabel: input.benchmark.produceLabel,
    groupBuyCents,
    supermarket: {
      state: "available",
      source: input.benchmark.source,
      lowCents,
      highCents,
      retrievedAt: input.benchmark.retrievedAt,
      placement,
      markerPercent: marker,
    },
    uplift,
  }
}
