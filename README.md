# Curbstand

Curbstand is a Seattle / Puget Sound group-buy platform connecting customers
with local producers at approved public pickup locations.

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

## Scheduling and resolution

Group buys store join, bid, and pickup windows as timezone-aware timestamps.
The `POST /jobs/resolve-group-buys` operator endpoint is intended to be called
by a scheduler. It cancels open/funding group buys whose relevant deadline has
passed and records an event for each resolution. It is safe to call repeatedly:
only still-open candidates are updated.

## API routes

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

All money and quantity values are stored as PostgreSQL `numeric` values and
serialized with explicit units in API responses.