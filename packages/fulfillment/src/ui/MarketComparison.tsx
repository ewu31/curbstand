import { deriveComparison } from "../benchmark/derive"
import type { PriceBenchmarkResponse } from "../benchmark/service"
import { formatUsdPerLb } from "../money"

function formatPacific(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date(iso))
    .replace("PDT", "PT")
    .replace("PST", "PT")
}

const PLACEMENT_COPY = {
  below: "Selected bid is below this estimated supermarket range.",
  inside: "Selected bid is inside this estimated supermarket range.",
  above: "Selected bid is above this estimated supermarket range.",
  "no-bid": "No selected bid yet.",
} as const

export function MarketComparison(props: {
  produceType: string
  groupBuyPricePerLb: string | null
  benchmark: PriceBenchmarkResponse | null
  error?: boolean
}) {
  if (props.benchmark && !props.benchmark.enabled) return null
  if (!props.benchmark) {
    if (!props.error) {
      return (
        <section className="card comparison" aria-busy="true" data-testid="market-comparison-loading">
          <h2>Market comparison</h2>
          <p>Loading the supermarket estimate.</p>
        </section>
      )
    }
    return (
      <section className="card comparison" data-testid="market-comparison">
        <h2>Market comparison</h2>
        <p data-testid="supermarket-unavailable">Supermarket estimate unavailable.</p>
      </section>
    )
  }

  const view = deriveComparison({
    produceType: props.produceType,
    groupBuyPricePerLb: props.groupBuyPricePerLb,
    benchmark: props.benchmark,
    now: new Date(),
  })
  if (view.kind === "hidden") return null

  const supermarket = view.supermarket
  return (
    <section className="card comparison" data-testid="market-comparison" aria-label="Market comparison">
      <p className="eyebrow">Seattle / Puget Sound · USD</p>
      <h2>Market comparison</h2>
      <p className="produce-name">{view.produceLabel}</p>
      <dl>
        <div>
          <dt>Group-buy price</dt>
          <dd data-testid="group-buy-price">
            {view.groupBuyCents === null ? "No selected bid yet" : formatUsdPerLb(view.groupBuyCents)}
          </dd>
        </div>
        <div>
          <dt>Estimated supermarket price</dt>
          <dd>
            {supermarket.state === "available" ? (
              <>
                <span data-testid="supermarket-price">
                  {formatUsdPerLb(supermarket.lowCents)}–{formatUsdPerLb(supermarket.highCents)}
                </span>
                <small>
                  {supermarket.source === "demo_sample"
                    ? "Demo sample, not a live Gemini estimate."
                    : "Approximate estimate. Not a live shelf price."}
                </small>
                <small>Retrieved {formatPacific(supermarket.retrievedAt)}.</small>
                <small>{PLACEMENT_COPY[supermarket.placement]}</small>
                {supermarket.markerPercent !== null ? (
                  <span className="range" aria-hidden="true">
                    <span style={{ left: `${supermarket.markerPercent}%` }} />
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span data-testid="supermarket-unavailable">Supermarket estimate unavailable.</span>
                {supermarket.lastSuccessfulRetrievedAt ? (
                  <small data-testid="last-retrieved">
                    Last successful retrieval {formatPacific(supermarket.lastSuccessfulRetrievedAt)}.
                  </small>
                ) : null}
              </>
            )}
          </dd>
        </div>
        {view.uplift.state === "shown" ? (
          <div>
            <dt>Farmer uplift</dt>
            <dd data-testid="farmer-uplift">
              {view.uplift.direction === "same"
                ? "Farmer bid matches the manual distribution-center baseline."
                : `Farmer receives ${formatUsdPerLb(Math.abs(view.uplift.deltaCents))} ${view.uplift.direction === "more" ? "more" : "less"} than the manual distribution-center baseline.`}
              <small>Manual baseline {formatUsdPerLb(view.uplift.baselineCents)}. Not a live quote.</small>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
