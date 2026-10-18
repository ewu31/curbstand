# Curbstand

Curbstand is a Seattle / Puget Sound group-buy platform connecting customers
with local producers at approved public pickup locations.

## Frontend

Requires Node.js 22.22.0 or newer. Install frontend dependencies separately
from the backend using `npm ci --prefix web`.

Run the complete browser demo without a database:

```sh
npm ci --prefix web
npm run demo:web
```

Open http://127.0.0.1:4321. Use `maya@curbstand.test` or
`jordan@curbstand.test` as a customer, or `elena@curbstand.test` as a producer,
with any nonempty password. Demo data and new demo accounts stay in the browser
tab. Customers can create and join requests, and producers can bid and confirm
fulfillment. The organizer can record simulated deposits; participants or the
selected producer can confirm manual pickup.

Use `npm run dev:web` to connect to the local API instead. Real registration,
deposit updates, and pickup completion still require backend endpoints; the UI
labels these limitations. QR check-in is unavailable, with manual pickup enabled
in the demo. No payment is processed.

`npm run dev` also starts the frontend from the repository root. To use the
Astro CLI, run `npm run astro -- dev` (plain `npm astro` is not an npm command).
If Astro reports another server is running, open its displayed URL or run
`npm run stop:web` before starting it again. To switch to the standalone demo,
stop the existing server first, then run `npm run demo:web`.

Run `npm run check:web`, `npm run build:web`, and `npm run test:web` to validate
the frontend. See [web/README.md](web/README.md) for configuration.

## Backend development

The backend uses a TypeScript workspace, Hono API, Drizzle ORM, and PostgreSQL.

### Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Start PostgreSQL.
3. Install dependencies:

   ```sh
   npm install
   ```

4. Apply the schema and seed the controlled produce catalog and approved pickup
   locations:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

5. Start the API:

   ```sh
   npm start
   ```

The API listens on `http://localhost:8787` by default.

## Current API authentication

The group-buy backend currently expects an existing user's UUID in the
`x-user-id` header. This is an explicit development seam for the authentication
foundation task; it is not a production authentication mechanism.

`npm run db:seed` inserts three demo users. The web app matches these emails
and sends the corresponding id. Passwords are not checked.

| Name | Email | Role |
| --- | --- | --- |
| Maya Chen | maya@curbstand.test | customer |
| Jordan Hale | jordan@curbstand.test | customer |
| Elena Ortiz | elena@curbstand.test | producer |

`GET /group-buys` includes `lowestBidPerLb` (`null` when nobody has bid) so
the marketplace grid can show a price without a second request. Local browser
calls from `http://localhost` or `http://127.0.0.1` are allowed.

## Scheduling and resolution

Group buys store join, bid, and pickup windows as timezone-aware timestamps.
The `POST /jobs/resolve-group-buys` operator endpoint is intended to be called
by a scheduler. It cancels open/funding group buys whose relevant deadline has
passed and records an event for each resolution. It is safe to call repeatedly:
only still-open candidates are updated.

## API routes

- `GET /health`
- `GET /produce`
- `GET /pickup-locations`
- `GET /group-buys?produceType=&locationId=`
- `POST /group-buys`
- `GET /group-buys/:id`
- `POST /group-buys/:id/participants`
- `PATCH /group-buys/:id/status`
- `POST /group-buys/:id/bids`
- `GET /group-buys/:id/bids`
- `POST /group-buys/:id/select-bid`
- `POST /jobs/resolve-group-buys`

All money and quantity values are stored as PostgreSQL `numeric` values and
serialized with explicit units in API responses.
