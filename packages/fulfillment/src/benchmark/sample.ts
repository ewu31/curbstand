import { hashPrompt } from "./gemini"
import { normalizeProduce } from "./normalize"
import type { Region, RetailEstimate } from "../types"

const SAMPLES: Record<string, [string, string]> = {
  apples: ["1.29", "2.49"],
  blueberries: ["3.99", "6.99"],
  carrots: ["0.89", "1.49"],
  kale: ["1.49", "2.29"],
  "leafy-greens": ["1.29", "2.49"],
  lettuce: ["1.19", "2.09"],
  potatoes: ["0.69", "1.19"],
  strawberries: ["2.49", "4.99"],
  tomatoes: ["1.99", "3.49"],
}

export async function demoSampleEstimate(input: { produceType: string; region: Region }): Promise<RetailEstimate> {
  const produce = normalizeProduce(input.produceType)
  const sample = produce ? SAMPLES[produce.id] : undefined
  if (!sample) throw new Error("Demo sample is unavailable")
  return {
    source: "demo_sample",
    retailLowPerLb: sample[0],
    retailHighPerLb: sample[1],
    model: "demo-sample",
    promptVersion: "demo-sample-v1",
    promptHash: await hashPrompt(input.produceType, input.region),
  }
}
