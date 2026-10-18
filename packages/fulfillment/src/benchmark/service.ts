import { normalizeProduce, normalizeRegion } from "./normalize"
import { assertPositiveMoney } from "../money"
import type { FulfillmentRepository } from "../repository"
import {
  PRICE_BENCHMARK_TTL_SECONDS,
  type BaselineRecord,
  type BenchmarkRecord,
  type EstimateMode,
  type Region,
  type RetailEstimate,
} from "../types"

export type PriceBenchmarkResponse =
  | { enabled: false }
  | {
      enabled: true
      status: "available"
      source: RetailEstimate["source"]
      produceType: string
      produceLabel: string
      region: Region
      currency: "USD"
      unit: "lb"
      retailLow: string
      retailHigh: string
      retrievedAt: string
      expiresAt: string
      approximation: true
      distributionBaselinePerLb: string | null
      baselineAsOf: string | null
    }
  | {
      enabled: true
      status: "unavailable"
      produceType: string | null
      region: Region | null
      currency: "USD"
      unit: "lb"
      lastSuccessfulRetrievedAt: string | null
      distributionBaselinePerLb: string | null
      baselineAsOf: string | null
    }

type Estimate = (input: { produceType: string; region: Region }) => Promise<RetailEstimate>

function unavailable(
  produceType: string | null,
  region: Region | null,
  retrievedAt: string | null,
  baseline: BaselineRecord | null,
): PriceBenchmarkResponse {
  return {
    enabled: true,
    status: "unavailable",
    produceType,
    region,
    currency: "USD",
    unit: "lb",
    lastSuccessfulRetrievedAt: retrievedAt,
    distributionBaselinePerLb: baseline?.baselinePerLb ?? null,
    baselineAsOf: baseline?.updatedAt ?? null,
  }
}

function available(record: BenchmarkRecord, baseline: BaselineRecord | null, label: string): PriceBenchmarkResponse {
  return {
    enabled: true,
    status: "available",
    source: record.source,
    produceType: record.produceType,
    produceLabel: label,
    region: record.region,
    currency: "USD",
    unit: "lb",
    retailLow: record.retailLow,
    retailHigh: record.retailHigh,
    retrievedAt: record.retrievedAt,
    expiresAt: record.expiresAt,
    approximation: true,
    distributionBaselinePerLb: baseline?.baselinePerLb ?? null,
    baselineAsOf: baseline?.updatedAt ?? null,
  }
}

function validateEstimate(estimate: RetailEstimate): { low: string; high: string } | null {
  try {
    const low = assertPositiveMoney(estimate.retailLowPerLb, "retailLowPerLb")
    const high = assertPositiveMoney(estimate.retailHighPerLb, "retailHighPerLb")
    if (low > high) return null
    if (estimate.source !== "gemini" && estimate.source !== "demo_sample") return null
    return { low: estimate.retailLowPerLb, high: estimate.retailHighPerLb }
  } catch {
    return null
  }
}

export async function getPriceBenchmark(
  repo: FulfillmentRepository,
  options: {
    enabled: boolean
    mode: EstimateMode
    estimate: Estimate | null
    now: Date
    ttlSeconds?: number
  },
  query: { produceType: string | null; region: string | null },
): Promise<PriceBenchmarkResponse> {
  if (!options.enabled) return { enabled: false }

  const produce = normalizeProduce(query.produceType)
  const region = normalizeRegion(query.region)
  if (!produce || !region) {
    return unavailable(produce?.id ?? null, region, null, null)
  }

  const baseline = await repo.getBaseline(produce.id, region)
  if (options.mode === "off" || !options.estimate) {
    const latest = await repo.getLatestBenchmark(produce.id, region)
    return unavailable(produce.id, region, latest?.retrievedAt ?? null, baseline)
  }

  const fresh = await repo.getFreshBenchmark(produce.id, region, options.now)
  if (fresh) return available(fresh, baseline, produce.label)

  try {
    const estimate = await options.estimate({ produceType: produce.id, region })
    const prices = validateEstimate(estimate)
    if (!prices) throw new Error("invalid estimate")
    const retrievedAt = options.now
    const expiresAt = new Date(retrievedAt.getTime() + (options.ttlSeconds ?? PRICE_BENCHMARK_TTL_SECONDS) * 1000)
    const record: BenchmarkRecord = {
      id: `bench_${crypto.randomUUID()}`,
      produceType: produce.id,
      region,
      currency: "USD",
      unit: "lb",
      retailLow: prices.low,
      retailHigh: prices.high,
      source: estimate.source,
      model: estimate.model,
      promptVersion: estimate.promptVersion,
      promptHash: estimate.promptHash,
      responseJson: {
        retailLowPerLb: prices.low,
        retailHighPerLb: prices.high,
        currency: "USD",
        unit: "lb",
      },
      retrievedAt: retrievedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }
    await repo.saveBenchmark(record)
    return available(record, baseline, produce.label)
  } catch {
    const latest = await repo.getLatestBenchmark(produce.id, region)
    return unavailable(produce.id, region, latest?.retrievedAt ?? null, baseline)
  }
}
