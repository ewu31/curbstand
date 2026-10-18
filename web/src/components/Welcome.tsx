export default function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="welcome-page">
      <div className="welcome-copy">
        <p className="eyebrow">WELCOME TO CURBSTAND</p>
        <h1>
          Good produce.
          <br />
          Great neighbors.
        </h1>
        <p className="welcome-lead">
          Neighbors buy fresh produce directly from the people who grow it.
        </p>
        <p>
          At-home growers, local farmers, and large scale farmers share the stand
          across Seattle and Puget Sound. A backyard harvest and a farm field
          both start the same way: a drop.
        </p>
        <button className="button" type="button" onClick={onContinue}>
          Explore produce drops
        </button>
        <p className="hint">Pickup stays in the neighborhood.</p>
      </div>
      <img className="welcome-photo" src="/produce/tomatoes.jpg" alt="Fresh tomatoes" />
      <ol className="welcome-steps">
        <li>
          <span aria-hidden="true">01</span>
          <h2>A grower sets the price</h2>
          <p>A grower sets a price per pound and a minimum the neighborhood has to reach.</p>
        </li>
        <li>
          <span aria-hidden="true">02</span>
          <h2>Neighbors commit quantities</h2>
          <p>You and your neighbors commit the pounds you want. Those quantities add up toward the minimum.</p>
        </li>
        <li>
          <span aria-hidden="true">03</span>
          <h2>The drop is confirmed</h2>
          <p>Once the minimum is reached, the pickup date is confirmed. Meet nearby and bring the produce home.</p>
        </li>
      </ol>
    </section>
  );
}
