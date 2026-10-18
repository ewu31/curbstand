# Curbstand

Group-buy platform for produce. See [DESIGN.md](./DESIGN.md) and
[IMPLEMENTATION_TASKS.md](./IMPLEMENTATION_TASKS.md).

## Stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript (ESM), Node ≥ 22, npm workspaces |
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

```sh
npm install          # also runs `prisma generate`
npm run db:setup     # creates apps/api/.env from .env.example, applies migrations, seeds
npm run dev          # API on http://127.0.0.1:3000 (watch mode)
npm test             # all workspaces
npm run typecheck
```

`npm run db:reset` drops and recreates the dev database, then reseeds.

### Environment (`apps/api/.env`)

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | Relative to `apps/api/prisma/` |
| `JWT_SECRET` | dev fallback | Required when `NODE_ENV=production` |
| `JWT_EXPIRES_IN` | `7d` | |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | |
| `DEPOSIT_AMOUNT_USD` | `5.00` | Fixed simulated deposit per participation (`config.depositAmountCents`) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |

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
| `GET /produce-types` | — | Controlled catalog |
| `GET /pickup-locations` | — | Approved public pickup locations |

Send the token as `Authorization: Bearer <token>`. `user` is `UserProfile` from
`@curbstand/shared` and never contains credentials.

## Conventions (all tasks)

**Errors.** Every non-2xx body is
`{ "error": { "code": "...", "message": "...", "details"?: ... } }`. Codes and
statuses are in `ERROR_CODES` (`packages/shared/src/errors.ts`):
`400 VALIDATION_ERROR`, `401 UNAUTHORIZED | INVALID_CREDENTIALS`,
`403 FORBIDDEN`, `404 NOT_FOUND`,
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
`serviceRadiusMiles`; use `distanceMiles()` against the pickup location.

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
