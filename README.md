# Curbstand

Group-buy platform for produce. See [DESIGN.md](./DESIGN.md) and
[IMPLEMENTATION_TASKS.md](./IMPLEMENTATION_TASKS.md).

## Stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript (ESM), Node ≥ 22.12 (`.nvmrc`: 22), npm workspaces |
| API | Fastify 5 (`apps/api`), run with `tsx` (no build step) |
| Database | SQLite via Prisma 6 (`apps/api/prisma/schema.prisma`) |
| Auth | Stateless JWT bearer tokens (HS256, `jose`), bcrypt password hashes |
| Validation | Zod 4 schemas, shared with the frontend |
| Tests | Vitest + `app.inject()` against a throwaway SQLite file |
| Frontend | `apps/web` (Task 2) |

```
packages/shared   @curbstand/shared — enums, units, time, error shape, catalog, request schemas
apps/api          @curbstand/api    — Fastify server, Prisma schema/migrations/seed
apps/web          @curbstand/web    — frontend (Task 2)
```

## Run locally

Requires Node 22.12+ (`nvm use` picks up `.nvmrc`). Fastify's test tooling
depends on `cookie@2`, which is ESM-only and declares `node >=22`; on Node 20
the API tests crash.
`.npmrc` sets `engine-strict`, so `npm install` fails early on an unsupported
version.

```sh
npm install          # also runs `prisma generate`
npm run db:setup     # creates apps/api/.env from .env.example, applies migrations, seeds
npm run dev          # API on http://127.0.0.1:8787 (watch mode); `npm start` without watch
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
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` | `10` / `60000` | Per-IP limit on signup and login; returns 429 `RATE_LIMITED` |
| `BODY_LIMIT_BYTES` | `65536` | Larger bodies get 413 `PAYLOAD_TOO_LARGE` |

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

## Group-buy API (Task 3)

| Route | Auth | Notes |
| --- | --- | --- |
| `GET /group-buys?produceType=&locationId=&status=` | — | `{ groupBuys }`; defaults to in-progress statuses, sorted by pickup start |
| `POST /group-buys` | customer | 201 `{ groupBuy }`; `createGroupBuySchema` |
| `GET /group-buys/:id` | any | `{ groupBuy }` (`GroupBuyDetail`, including `myParticipation` and `events`) |
| `POST /group-buys/:id/participants` | customer | 201 `{ participant }`; first join moves `open → funding`; records a `pending` deposit intent |
| `POST /group-buys/:id/bids` | producer | 201 `{ bid }`; producer must be eligible (grows the produce type, pickup within service radius; otherwise 403 `NOT_ELIGIBLE` with `reasons`); open/funding only, before `bidDeadline`; availability must cover the pickup window |
| `GET /group-buys/:id/bids` | — | `{ bids }`, cheapest first |
| `POST /group-buys/:id/select-bid` | owner | `{ groupBuy }`; requires `funding`, committed ≥ target, before `bidDeadline`; matches once |
| `PATCH /group-buys/:id/status` | see notes | `{ groupBuy }`. `cancelled`: owner while open/funding, or an operator. `ready_for_pickup`: the selected bid's producer, while matched |
| `POST /jobs/resolve-group-buys` | operator | `{ resolvedGroupBuyIds, resolvedAt }` |

Conflict codes (409): `GROUP_BUY_CLOSED`, `DEADLINE_PASSED`, `ALREADY_JOINED`,
`QUANTITY_UNAVAILABLE`, `THRESHOLD_NOT_MET`, `ALREADY_MATCHED`,
`INVALID_TRANSITION`.

### Scheduling and resolution

Join, bid, and pickup windows are stored as UTC timestamps. A scheduler is meant
to call `POST /jobs/resolve-group-buys` (as an operator). It cancels `open`
group buys past their join deadline and `funding` group buys past their bid
deadline, recording a `group_buy.cancelled` event with
`reason: "deadline_expired"` for each one. It is safe to call repeatedly,
because only rows that are still eligible are changed.

## Group-buy contract (Tasks 2–4)

Request schemas and response types live in
`packages/shared/src/schemas/group-buys.ts`. Use them on both sides instead of
redefining shapes.

- **Requests:** `listGroupBuysQuerySchema`, `createGroupBuySchema` (also checks
  `joinDeadline < bidDeadline ≤ pickupWindowStart < pickupWindowEnd`),
  `joinGroupBuySchema`, `updateGroupBuyStatusSchema`, `createBidSchema`,
  `selectBidSchema`. Parsing converts to storage units: cents, lbs×100, `Date`.
  Checks that depend on the clock ("deadline not passed") and on DB state are
  left to the route.
- **Responses:** `GroupBuySummary`, `GroupBuyDetail` (adds `selectedBid`,
  `myParticipation`, `participants`, `depositSummary` with `simulated: true`,
  and `events` oldest first), `ParticipantDto`, `BidDto`, `EventDto`.
- **Envelopes:** one named key per resource: `{ groupBuys }`, `{ groupBuy }`,
  `{ participant }`, `{ bid }`, `{ bids }` (sorted by `pricePerLbUsd`).
- **Server serializers** (`apps/api/src/lib/serializers.ts`): load with the
  matching include, then serialize:

  ```ts
  const row = await prisma.groupBuy.findUnique({ where: { id }, include: groupBuyDetailInclude });
  return { groupBuy: toGroupBuyDetail(row, authUser(request).id, config.depositAmountCents) };
  ```

  Others: `toGroupBuySummary` + `groupBuySummaryInclude`, `toBid` +
  `bidInclude`, `toParticipant` + `participantInclude`, `toEvent`,
  `toDepositSummary`, `committedLbsX100`. An unknown status string in the DB
  throws instead of being passed through.
- **Events:** write them with `recordEvent(tx, { groupBuyId, actorUserId, eventType, payload })`
  (`apps/api/src/lib/events.ts`). The payload holds ids, statuses, quantities and
  reasons only, never contact details or secrets.

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
