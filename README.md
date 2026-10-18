# Curbstand

Group-buy platform for produce. See [DESIGN.md](./DESIGN.md) and
[IMPLEMENTATION_TASKS.md](./IMPLEMENTATION_TASKS.md).

## Frontend and Docker API

Requires Node 22.22+ and Docker Desktop running with Linux containers.

```sh
npm ci
npm ci --prefix web
npm run dev
```

Open http://127.0.0.1:4321. `npm run dev` builds and starts the API container,
waits for database migrations and health checks, then starts Astro locally with
hot reload. The API is at http://127.0.0.1:8787. SQLite persists in the
`api-data` Docker volume across restarts and rebuilds. Ctrl+C stops Astro;
`npm run server:down` stops the API without deleting its data.

Run `npm run server:seed` once to add demo accounts.
Use `alice@demo.curbstand.app` (customer) or `farmer.joe@demo.curbstand.app`
(producer), password `password123`. Registration also creates real customer
and producer accounts. Producer registration requires farm location, service
radius, and produce types for their producer profile.

- `npm run server:up`: build/start API; rerun after server source changes.
- `npm run server:logs`: follow API logs.
- `npm run dev:web`: frontend only, using `PUBLIC_API_BASE` (default local API).
- `npm run dev:api`: local API watch mode after `npm run db:setup`.
- `npm run demo:web`: standalone browser fixture demo, no API required.
- `npm run check:web`, `npm run build:web`, `npm run test:web`: frontend checks.
- `npm run test:integration`: live browser journey against Docker (creates test accounts and a group buy in its database; requires Playwright Chromium or local Edge).

The Compose configuration is for local development and binds the API only to
localhost. Set a strong `JWT_SECRET`, production environment, and explicit
`CORS_ORIGINS` for a production deployment. Images contain neither local `.env`
files nor databases. Migrations and reference catalog setup run on startup; demo account seeding is explicit.

Live deposits are simulated intents. Deposit updates and pickup check-in still
await backend endpoints; their controls remain available only in fixture mode.

## Stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript (ESM), Node ≥ 22.12 (`.nvmrc`: 22), npm workspaces |
| API | Fastify 5 (`apps/api`), run with `tsx` (no build step) |
| Database | SQLite via Prisma 6 (`apps/api/prisma/schema.prisma`) |
| Auth | Stateless JWT bearer tokens (HS256, `jose`), bcrypt password hashes |
| Validation | Zod 4 schemas, shared with the frontend |
| Tests | Vitest + `app.inject()` against a throwaway SQLite file |
| Frontend | Astro + React (`web`) |

```
packages/shared   @curbstand/shared — enums, units, time, error shape, catalog, request schemas
apps/api          @curbstand/api    — Fastify server, Prisma schema/migrations/seed
apps/web          @curbstand/web    — frontend (Task 2)
```

## Run locally

Requires Node 22.22+ (`nvm use` picks up `.nvmrc`). Fastify's test tooling
depends on `cookie@2`, which is ESM-only and declares `node >=22`; on Node 20
the API tests crash.
`.npmrc` sets `engine-strict`, so `npm install` fails early on an unsupported
version.

```sh
npm install          # also runs `prisma generate`
npm run db:setup     # creates apps/api/.env from .env.example, applies migrations, seeds
npm run dev:api      # API on http://127.0.0.1:8787 (watch mode); `npm start` without watch
npm test             # all workspaces
npm run typecheck
```

`npm run db:seed` reseeds (idempotent). `npm run db:reset` drops and recreates the dev database, then reseeds.

### Environment (`apps/api/.env`)

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | Relative to `apps/api/prisma/` |
| `JWT_SECRET` | dev fallback | Required when `NODE_ENV=production` |
| `JWT_EXPIRES_IN` | `7d` | |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | |
| `DEPOSIT_AMOUNT_USD` | `5.00` | Fixed simulated deposit per participation (`config.depositAmountCents`) |
| `CORS_ORIGINS` | `http://localhost:4321,http://127.0.0.1:4321` | Comma-separated |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` | `10` / `60000` | Per-IP limit on signup and login; returns 429 `RATE_LIMITED` |
| `BODY_LIMIT_BYTES` | `65536` | Larger bodies get 413 `PAYLOAD_TOO_LARGE` |
| `PRICE_COMPARISON_ENABLED` | `true` | Set `false` to hide supermarket numbers. Deposits and check-in still work |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | empty / `gemini-2.5-flash` | Server-side only. Without a key the widget shows a labeled demo sample |
| `PHOTON_API_KEY` / `PHOTON_PROJECT_ID` / `PHOTON_SMS_SENDER_ID` | empty | Photon 2.0 beta (`https://api.photon.codes/v1`). Sends the pickup text. Website chat still works when these are empty |
| `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET` | empty | Photon Spectrum iMessage agent (`npm run spectrum -w @curbstand/api`). Separate from the beta SMS keys |

The pickup widget proxies `/api` to the API:

```sh
npm run dev -w @curbstand/fulfillment   # http://localhost:5173
```

### Demo accounts (seeded, password `password123`)

| Email | Role |
| --- | --- |
| `alice@demo.curbstand.app`, `bob@demo.curbstand.app` | customer (individual) |
| `kitchen@demo.curbstand.app` | customer (restaurant) |
| `operator@demo.curbstand.app` | customer + operator |
| `farmer.joe@demo.curbstand.app` | producer: potatoes, onions, carrots, strawberries (Skagit, 80 mi) |
| `farmer.maria@demo.curbstand.app` | producer: apples, pears, cherries (Yakima, 160 mi) |
| `farmer.sam@demo.curbstand.app` | producer: lettuce, kale, tomatoes (Snoqualmie, 40 mi) |

## API (Task 1)

| Route | Auth | Notes |
| --- | --- | --- |
| `GET /health` | — | `{ status, database }`, 503 if DB unreachable |
| `POST /auth/signup` | — | 201 `{ token, user }`; body is `signupSchema` (discriminated on `role`) |
| `POST /auth/login` | — | `{ token, user }`; 401 `INVALID_CREDENTIALS` |
| `GET /me` | any | `{ user }` |
| `PATCH /me` | any | `{ user }`; partial update of own profile. Customer: `name`, `phone`, `orgType`. Producer: `name`, `phone`, `farmName`, `produceTypes` (replaces the list), `serviceRadiusMiles`, `farmLatitude`, `farmLongitude`. `phone: null` clears it. Role, email, and password are not editable; unknown or other-role fields are a 400. |
| `GET /produce-types` | — | Controlled catalog |
| `GET /pickup-locations` | — | Approved public pickup locations |

Send the token as `Authorization: Bearer <token>`. `user` is `UserProfile` from
`@curbstand/shared` and never contains credentials.

## Conventions (all tasks)

**Errors.** Every non-2xx body is
`{ "error": { "code": "...", "message": "...", "details"?: ... } }`. Codes and
statuses are in `ERROR_CODES` (`packages/shared/src/errors.ts`):
`400 VALIDATION_ERROR`, `401 UNAUTHORIZED | INVALID_CREDENTIALS`,
`403 FORBIDDEN`, `404 NOT_FOUND`, `413 PAYLOAD_TOO_LARGE`, `429 RATE_LIMITED`,
`409 CONFLICT | EMAIL_TAKEN | INVALID_TRANSITION | DEADLINE_PASSED`,
`500 INTERNAL_ERROR`. On the server, throw `HttpError` or a helper
(`forbidden()`, `conflict()`, `invalidTransition(from, to)`,
`deadlinePassed("join", at)`, …) from `apps/api/src/lib/errors.ts`. Throwing a
`ZodError` (e.g. `schema.parse(request.body)`) becomes a 400 with per-field
`details`.

**Money and quantity.** Never floats.
- DB: integer minor units. Money is `*Cents` (USD cents); quantity is `*LbsX100`
  (hundredths of a pound).
- API: decimal strings with 2 places, with the unit in the field name:
  `pricePerLbUsd: "2.50"`, `depositAmountUsd: "5.00"`, `targetLbs: "50.00"`.
- Helpers in `@curbstand/shared`: `usdToCents`/`centsToUsd`,
  `lbsToHundredths`/`hundredthsToLbs`, `lineTotalCents`, and Zod
  `usdAmountSchema`, `positiveUsdAmountSchema`, `positiveLbsSchema`.

**Timestamps.** API uses ISO 8601 UTC (`toISOString()`); inputs are parsed with
`isoDateTimeSchema`. Display in Pacific Time (`DEMO_TIME_ZONE`, `formatPacific`).

**JSON** is camelCase. Responses always include status fields explicitly;
clients must not infer state from a missing field.

**Statuses.** Import from `@curbstand/shared`, never retype string literals:
`ROLES`, `ORG_TYPES`, `GROUP_BUY_STATUSES` + `canTransitionGroupBuy`,
`BID_STATUSES`, `DEPOSIT_STATUSES` + `canTransitionDeposit`,
`COMPLETION_STATUSES`, `EVENT_TYPES`. SQLite has no enums, so the DB stores plain
strings; validate with these lists (`isOneOf`, `z.enum(...)`).

**Location matching.** Producers have `farmLatitude`/`farmLongitude` and
`serviceRadiusMiles`. `producerEligibility(profile, groupBuy)` returns
`{ eligible, reasons, distanceMiles }`. The bid route enforces it, and the
frontend can use it to filter the producer dashboard.

## Fixed-price produce drops

| Route | Auth | Notes |
| --- | --- | --- |
| `GET /group-buys?produceType=&locationId=&status=` | — | `{ groupBuys }`; defaults to in-progress statuses, sorted by pickup start |
| `POST /group-buys` | customer | 201 `{ groupBuy }`; `createGroupBuySchema` |
| `GET /group-buys/:id` | any | `{ groupBuy }` (`GroupBuyDetail`, including `myParticipation` and `events`) |
| `POST /group-buys/:id/participants` | customer | 201 `{ participant }`; first join moves `open → funding`; records a `pending` deposit intent |
| `POST /group-buys/:id/bids` | producer | 201 `{ bid }`; producer must be eligible (grows the produce type, pickup within service radius; otherwise 403 `NOT_ELIGIBLE` with `reasons`); open/funding only, before `bidDeadline`; availability must cover the pickup window |
| `GET /group-buys/:id/bids` | — | `{ bids }`, cheapest first |
| `POST /group-buys/:id/select-bid` | owner | `{ groupBuy }`; requires `funding`, committed ≥ target, before `bidDeadline`; matches once |
| `PATCH /group-buys/:id/status` | see notes | `{ groupBuy }`. `cancelled`: owner while open/funding, or an operator; confirmed deposits are marked `refunded_manual`. `ready_for_pickup`: the selected bid's producer, while matched; check-in codes are issued and each customer is queued for a Photon pickup text |
| `GET /group-buys/:id/messages` | owner, participant, selected farmer, or operator | `{ chat }` with the website thread. Operator is read-only |
| `POST /group-buys/:id/messages` | owner, participant, or selected farmer | 201 `{ message }`. Opens after a farmer is selected |
| `PATCH /group-buys/:id/participants/:participantId/deposit` | owner or operator | `{ status }` is `confirmed_manual`, `refunded_manual`, or `forfeited_manual`. No money moves |
| `GET /group-buys/:id/participants/:participantId/check-in-token` | participant, selected producer, or operator | `{ token }` for the QR payload |
| `POST /group-buys/:id/check-in` | participant, selected producer, or operator | `{ token }` or `{ participantId, method: "manual" }` |
| `POST /group-buys/:id/complete` | owner, selected producer, or operator | Idempotent once every active participant is checked in |
| `POST /group-buys/:id/cancel` | owner or operator | Cancels an open, funding, or matched buy and marks confirmed deposits refunded |
| `GET /price-benchmarks?produceType=&region=` | any | Approximate supermarket range, or `{ enabled: false }` when the flag is off |
| `POST /jobs/resolve-group-buys` | operator | `{ resolvedGroupBuyIds, resolvedAt }` |

- `POST /group-buys`: producer only; price and quantities are decimal strings.
- `GET /group-buys`: public browse; includes price and seller name.
- `GET /group-buys/:id`: authenticated detail.
- `POST /group-buys/:id/participants`: customer commitment.
- `PATCH /group-buys/:id/status`: seller marks a confirmed drop ready for pickup;
  seller can cancel an open/funding drop, and operators can cancel as allowed.
- `POST /jobs/resolve-group-buys`: expires unconfirmed drops at the join deadline.

Bidding and bid-selection routes have been removed. Historical bid tables and
fields remain for existing data; legacy requests with no fixed seller price
cannot accept new commitments. Sellers should publish a new fixed-price drop.

Producer profiles support `producerType`: `at_home`, `local_farmer`, or
`large_scale_farmer`, editable at signup and with `PATCH /me`. Existing producers
default to `local_farmer`. The frontend includes profile editing and a first-visit
welcome page, remembered in browser local storage.

Apply the additive migrations with `npm run db:deploy -w @curbstand/api`, or
rebuild the local Docker API with `npm run server:up` (migrations run on startup).
No existing records are deleted. Payments remain simulated deposit intents.

## Adding routes (Tasks 3 and 4)

Create a new file in `apps/api/src/routes/` that default-exports a Fastify
plugin. It is registered automatically, so don't edit `app.ts`.

```ts
// apps/api/src/routes/group-buys.ts
import type { FastifyPluginAsync } from "fastify";
import { authUser, requireCustomer, requireOwner, assertOwner } from "../auth/guards";
import { prisma } from "../lib/db";
import { conflict } from "../lib/errors";

const routes: FastifyPluginAsync = async (app) => {
  app.post("/group-buys", { preHandler: requireCustomer }, async (request, reply) => {
    const user = authUser(request); // { id, role, isOperator }
    // ...
  });
};
export default routes;
```

Guards (`apps/api/src/auth/guards.ts`). All return 401 when unauthenticated and
403 when not allowed:

- `requireAuth`: any logged-in user
- `requireCustomer`, `requireProducer`, `requireRole(...roles)`
- `requireOperator`: `users.isOperator` (seeded operator account). Operators
  keep a normal role; this is a flag, not a third role.
- `requireOwner(req => ownerIdOrNull, { allowOperator? })`: 404 if null, 403 if
  not the owner
- `assertOwner(user, ownerId, { allowOperator? })`: the same check, for use
  inside a handler

Tests: copy `apps/api/test/auth.test.ts`. `test/helpers.ts` has
`createTestApp()`, `signup(app, customerSignup())`/`producerSignup()` (returns
`auth` headers), and `prisma`.

## Database changes

The full MVP schema (all DESIGN.md §9 tables) is already in the `init`
migration. If you need a change, edit `schema.prisma` and run
`npm run db:migrate -w @curbstand/api -- --name <short_name>`. Keep migrations
small and rebase onto `main` before creating one, so that two migrations don't
race.
