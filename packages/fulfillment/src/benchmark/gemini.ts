import { sha256Hex } from "../hash"
import type { Region, RetailEstimate } from "../types"

export const PROMPT_VERSION = "retail-range-v1"
export const GEMINI_MODEL = "gemini-2.5-flash"

export function buildRetailRangePrompt(produceType: string, region: Region): string {
  return [
    "Estimate the current supermarket retail price per pound for one produce type.",
    "Return JSON only with keys retailLowPerLb, retailHighPerLb, currency, and unit.",
    "currency must be USD. unit must be lb.",
    "Use decimal strings with at most 2 fraction digits.",
    "retailLowPerLb must be less than or equal to retailHighPerLb.",
    "Do not include store names, shopper data, or personal data.",
    `produce_type: ${produceType}`,
    `region: ${region}`,
  ].join("\n")
}

export async function hashPrompt(produceType: string, region: Region): Promise<string> {
  return sha256Hex(buildRetailRangePrompt(produceType, region))
}

export function parseRetailRange(value: unknown): { retailLowPerLb: string; retailHighPerLb: string } | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (record.currency !== "USD" || record.unit !== "lb") return null
  if (typeof record.retailLowPerLb !== "string" || typeof record.retailHighPerLb !== "string") return null
  return {
    retailLowPerLb: record.retailLowPerLb,
    retailHighPerLb: record.retailHighPerLb,
  }
}

export function parseGeminiGenerateContent(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") throw new Error("Gemini request failed")
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") {
    throw new Error("Gemini request failed")
  }
  const parts = (candidates[0] as { content?: { parts?: unknown } }).content?.parts
  if (!Array.isArray(parts) || !parts[0] || typeof parts[0] !== "object") throw new Error("Gemini request failed")
  const text = (parts[0] as { text?: unknown }).text
  if (typeof text !== "string") throw new Error("Gemini request failed")
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error("Gemini request failed")
  }
}

export function createGeminiEstimator(options: {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}): (input: { produceType: string; region: Region }) => Promise<RetailEstimate> {
  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model ?? GEMINI_MODEL
  return async ({ produceType, region }) => {
    const prompt = buildRetailRangePrompt(produceType, region)
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`)
    url.searchParams.set("key", options.apiKey)
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      })
      if (!response.ok) throw new Error("Gemini request failed")
      const parsed = parseRetailRange(parseGeminiGenerateContent(await response.json()))
      if (!parsed) throw new Error("Gemini request failed")
      return {
        source: "gemini",
        retailLowPerLb: parsed.retailLowPerLb,
        retailHighPerLb: parsed.retailHighPerLb,
        model,
        promptVersion: PROMPT_VERSION,
        promptHash: await hashPrompt(produceType, region),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (options.apiKey && message.includes(options.apiKey)) {
        throw new Error("Gemini request failed")
      }
      throw new Error("Gemini request failed")
    }
  }
}
