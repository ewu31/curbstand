# Curbstand

Curbstand is a Seattle / Puget Sound group-buy platform connecting customers with local producers at approved public pickup locations.

## Backend

The backend uses a TypeScript workspace, Fastify API, Prisma ORM, and SQLite.

### Setup

1. Copy `.env.example` to `.env`. The default database is a local SQLite file.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Apply the schema and seed the catalog, pickup locations, demo users, and a ready-for-pickup tomato group buy:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

4. Start the API:

   ```sh
   npm start
   ```

The API listens on `http://localhost:8787`. Send an existing user id in the `x-user-id` header. That header is a development seam, not production authentication.

`GET /dev/actors` lists seeded users so the fulfillment screen can switch actors. It does not return password hashes.

## Fulfillment widget

`packages/fulfillment` is the deposit, check-in, event, and supermarket comparison UI. It calls the API through a dev-server proxy.

```sh
npm run dev --workspace @curbstand/fulfillment
```

Open `http://localhost:5173` after the API and seed have been run.

Deposit changes, QR check-in, manual check-in, completion, cancellation refunds, and price benchmarks are stored in the same SQLite database as the group buys. Check-in codes are stored as hashes on the participant, with the display token in `CheckInToken`. Price estimates are cached in `PriceBenchmark`. Without `GEMINI_API_KEY`, estimates are labeled demo samples. If Gemini fails or the feature flag is off, the group-buy flow still works and supermarket prices are hidden.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file. The client resolves `file:./curbstand.db` to `packages/db/curbstand.db`. |
| `API_PORT` | API port. Default `8787`. |
| `DEPOSIT_AMOUNT_USD` | Flat deposit intent recorded when a customer joins. Default `10` in code, `5.00` in the example env. |
| `PRICE_COMPARISON_ENABLED` | Set to `false` to hide the comparison endpoint's estimate. |
| `GEMINI_API_KEY` | Optional live supermarket estimate. The key stays on the server. |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-2.5-flash`. |

### Task 4 routes

- `PATCH /group-buys/:id/participants/:participantId/deposit`
- `GET /group-buys/:id/participants/:participantId/check-in-token`
- `POST /group-buys/:id/check-in`
- `POST /group-buys/:id/complete`
- `POST /group-buys/:id/cancel`
- `GET /price-benchmarks?produceType=&region=`

`PATCH /group-buys/:id/status` still performs the group-buy status change. Cancelling an open, funding, or matched buy also marks confirmed deposits `refunded_manual`. Moving a matched buy to `ready_for_pickup` issues check-in codes.

## Other API routes

- `GET /health`
- `GET /group-buys?produceType=&locationId=`
- `POST /group-buys`
- `GET /group-buys/:id`
- `POST /group-buys/:id/participants`
- `PATCH /group-buys/:id/status`
- `POST /group-buys/:id/bids`
- `GET /group-buys/:id/bids`
- `POST /group-buys/:id/select-bid`
- `POST /jobs/resolve-group-buys`

Money and quantity values are stored as fixed two-decimal strings. The API validates them and serializes units in responses.
