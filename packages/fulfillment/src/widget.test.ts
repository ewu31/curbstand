import { describe, expect, it } from "vitest"
import { deriveComparison } from "./benchmark/derive"
import { createGeminiEstimator, parseGeminiGenerateContent } from "./benchmark/gemini"
import { normalizeProduce, normalizeRegion } from "./benchmark/normalize"
import { parseMoneyToCents } from "./money"
import type { PriceBenchmarkResponse } from "./benchmark/service"

describe("comparison widget model", () => {
  it("hides stale or unavailable supermarket numbers and still shows the manual baseline", () => {
    const stale: PriceBenchmarkResponse = {
      enabled: true,
      status: "available",
      source: "gemini",
      produceType: "kale",
      produceLabel: "Kale",
      region: "seattle-puget-sound",
      currency: "USD",
      unit: "lb",
      retailLow: "9.99",
      retailHigh: "10.99",
      retrievedAt: "2026-10-17T00:00:00.000Z",
      expiresAt: "2026-10-17T06:00:00.000Z",
      approximation: true,
      distributionBaselinePerLb: "0.40",
      baselineAsOf: "2026-10-17T00:00:00.000Z",
    }
    const view = deriveComparison({
      produceType: "kale",
      groupBuyPricePerLb: "1.10",
      benchmark: stale,
      now: new Date("2026-10-18T01:00:00.000Z"),
    })
    expect(view.kind).toBe("ready")
    if (view.kind !== "ready") return
    expect(view.supermarket.state).toBe("unavailable")
    expect(view.supermarket).not.toHaveProperty("lowCents")
    expect(view.uplift).toMatchObject({ state: "shown", direction: "more", deltaCents: 70 })

    expect(
      deriveComparison({
        produceType: "kale",
        groupBuyPricePerLb: "1.10",
        benchmark: { enabled: false },
        now: new Date(),
      }).kind,
    ).toBe("hidden")
  })

  it("places a selected bid against an approximate range", () => {
    const view = deriveComparison({
      produceType: "kale",
      groupBuyPricePerLb: "1.10",
      now: new Date("2026-10-18T01:00:00.000Z"),
      benchmark: {
        enabled: true,
        status: "available",
        source: "demo_sample",
        produceType: "kale",
        produceLabel: "Kale",
        region: "seattle-puget-sound",
        currency: "USD",
        unit: "lb",
        retailLow: "1.49",
        retailHigh: "2.29",
        retrievedAt: "2026-10-18T01:00:00.000Z",
        expiresAt: "2026-10-18T07:00:00.000Z",
        approximation: true,
        distributionBaselinePerLb: "0.40",
        baselineAsOf: null,
      },
    })
    expect(view).toMatchObject({
      kind: "ready",
      supermarket: { state: "available", placement: "below", source: "demo_sample" },
    })
  })
})

describe("normalize and money", () => {
  it("accepts catalog aliases and decimal currency only", () => {
    expect(normalizeProduce("Tomato")?.id).toBe("tomatoes")
    expect(normalizeProduce("dragonfruit")).toBeNull()
    expect(normalizeRegion("seattle")).toBe("seattle-puget-sound")
    expect(normalizeRegion("Portland")).toBeNull()
    expect(parseMoneyToCents("1.10")).toBe(110)
    expect(parseMoneyToCents("1.234")).toBeNull()
    expect(parseMoneyToCents("$1.00")).toBeNull()
  })
})

describe("gemini client", () => {
  it("parses a structured estimate and strips the API key from errors", async () => {
    const parsed = parseGeminiGenerateContent({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ retailLowPerLb: "1.49", retailHighPerLb: "2.29", currency: "USD", unit: "lb" }) }] } }],
    })
    expect(parsed).toMatchObject({ retailLowPerLb: "1.49", retailHighPerLb: "2.29" })

    const estimate = createGeminiEstimator({
      apiKey: "super-secret-key",
      fetchImpl: async (url) => {
        throw new Error(`network ${String(url)}`)
      },
    })
    await expect(estimate({ produceType: "kale", region: "seattle-puget-sound" })).rejects.toThrow("Gemini request failed")
    await expect(estimate({ produceType: "kale", region: "seattle-puget-sound" })).rejects.not.toThrow(/super-secret-key/)
  })
})
