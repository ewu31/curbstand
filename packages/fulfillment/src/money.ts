const MONEY = /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/

export function parseMoneyToCents(value: string): number | null {
  const trimmed = value.trim()
  if (!MONEY.test(trimmed)) return null
  const [dollars, fraction = ""] = trimmed.split(".")
  return Number(dollars) * 100 + Number(fraction.padEnd(2, "0"))
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

export function formatUsdPerLb(cents: number): string {
  return `${formatUsd(cents)}/lb`
}

export function assertPositiveMoney(value: string, label: string): number {
  const cents = parseMoneyToCents(value)
  if (cents === null || cents <= 0) {
    throw new Error(`${label} must be a positive USD decimal.`)
  }
  return cents
}
