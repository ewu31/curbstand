import { createGeminiEstimator } from "../benchmark/gemini"
import { demoSampleEstimate } from "../benchmark/sample"
import { createFulfillmentApi, type DemoControls } from "../api"
import { FulfillmentError } from "../errors"
import { MemoryFulfillmentRepository, MemoryTokenStore } from "../memory"
import { seedScenario, type DemoScenario } from "../seed"
import type { EstimateMode } from "../types"

export function createDemoController() {
  const repo = new MemoryFulfillmentRepository()
  const tokens = new MemoryTokenStore()
  let priceComparisonEnabled = true
  let estimateMode: EstimateMode = process.env.GEMINI_API_KEY ? "gemini" : "demo_sample"
  const gemini = process.env.GEMINI_API_KEY
    ? createGeminiEstimator({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      })
    : null

  const demoControls: DemoControls = {
    async reset(scenario: DemoScenario) {
      repo.clear()
      tokens.clear()
      await seedScenario(repo, tokens, scenario, new Date())
    },
    setPriceComparisonEnabled(enabled: boolean) {
      priceComparisonEnabled = enabled
    },
    setEstimateMode(mode: EstimateMode) {
      if (mode === "gemini" && !gemini) {
        throw new FulfillmentError(409, "conflict", "GEMINI_API_KEY is not configured.")
      }
      estimateMode = mode
    },
    capabilities() {
      return {
        geminiConfigured: Boolean(gemini),
        priceComparisonEnabled,
        estimateMode,
      }
    },
  }

  const api = createFulfillmentApi({
    repo,
    tokens,
    now: () => new Date(),
    priceComparisonEnabled: () => priceComparisonEnabled,
    estimateMode: () => estimateMode,
    estimate: (input) => {
      if (estimateMode === "gemini") {
        if (!gemini) throw new Error("Gemini is not configured")
        return gemini(input)
      }
      if (estimateMode === "demo_sample") return demoSampleEstimate(input)
      throw new Error("Estimates are off")
    },
    demoControls,
  })

  return {
    api,
    seedScenario(scenario: DemoScenario) {
      return seedScenario(repo, tokens, scenario, new Date())
    },
  }
}
