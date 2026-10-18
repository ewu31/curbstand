# Curbstand MVP Implementation Tasks

This plan splits the MVP into four independently executable agent tasks. Each
task should deliver a vertical slice with tests or a runnable demo where
practical. Agents must follow the decisions in [DESIGN.md](./DESIGN.md).

## Shared implementation contract

All tasks should use these decisions consistently:

- Demo geography: Seattle / Puget Sound, USD, Pacific Time.
- Roles: exactly one `customer` or `producer` role per user.
- Pickup locations: selected from an approved public-location list.
- Group-buy lifecycle:
  `open -> funding -> matched -> ready_for_pickup -> completed`.
- Cancellation is reachable from `open`, `funding`, or `matched`.
- Join and bid deadlines are required and enforced.
- Deposits are simulated only; statuses are
  `pending`, `confirmed_manual`, `refunded_manual`, and `forfeited_manual`.
- Pickup completion supports QR check-in with manual check-in as fallback.
- No realtime push notifications; clients refresh or poll.
- Currency values use decimal-safe storage and serialization.

Before implementation begins, agents should agree on the framework, database,
authentication approach, and local run commands. If the repository does not
yet contain those choices, Task 1 owns the initial scaffold and must document
them in `README.md` so the other tasks can build against a stable baseline.

## Task 1 — Application foundation, authentication, and shared domain

### Objective

Create the application scaffold and establish the shared persistence,
authentication, authorization, and domain primitives that the other tasks use.

### Scope

- Set up the application, database, migrations, seed data, and local run
  commands.
- Implement user registration, login, session/token handling, and `GET /me`.
- Implement the `customer` and `producer` roles and role-based authorization.
- Implement customer and producer profile fields.
- Define shared enums/types for lifecycle, bid, deposit, completion, and event
  statuses.
- Define currency, quantity, timestamp, and error-response conventions.
- Seed:
  - A small controlled produce catalog.
  - Approved public pickup locations in Seattle / Puget Sound.
  - Demo users for both roles, if the project uses seeded accounts.
- Add a basic health check and test setup.

### Required contract

The task must expose:

- `POST /auth/signup`
- `POST /auth/login`
- `GET /me`

It must provide reusable authorization guards for:

- authenticated user,
- customer,
- producer,
- resource owner,
- operator/admin actions.

### Out of scope

- Group-buy creation or joining UI/API.
- Bid submission or selection.
- Deposit state transitions.
- Pickup completion.
- Gemini integration.

### Acceptance criteria

- A new user can register, log in, and retrieve their own profile.
- Role-protected routes reject unauthenticated and unauthorized requests with
  the agreed `401` and `403` responses.
- Passwords and session credentials are not stored or logged in plaintext.
- Database setup works from a clean checkout using the documented commands.
- Other agents can import the shared domain types and authentication helpers
  without duplicating them.

## Task 2 — Frontend application and user journeys

### Objective

Build the frontend application for both customer and producer journeys against
the shared API contract. This task owns presentation and client state only;
it must not implement server-side business rules.

### Scope

- Build authentication screens for sign up, sign in, and role-aware routing.
- Build the customer marketplace with produce/location filters.
- Build the group-buy creation form using approved pickup locations.
- Build group-buy detail pages with threshold progress, deadlines,
  participation, bids, deposit status, event history, and pickup details.
- Build the customer dashboard for created and joined group buys.
- Build the producer dashboard with eligible group buys, bid submission,
  selected-bid status, and fulfillment status.
- Build deposit controls, QR check-in, and manual check-in fallback UI.
- Add loading, empty, validation, unauthorized, conflict, and offline/error
  states.
- Keep all currency, quantity, and timestamps formatted with explicit units.

### Required contract

The frontend consumes:

- `POST /auth/signup`
- `POST /auth/login`
- `GET /me`
- `GET /group-buys?produceType=&locationId=`
- `POST /group-buys`
- `GET /group-buys/:id`
- `POST /group-buys/:id/participants`
- `PATCH /group-buys/:id/status`
- `POST /group-buys/:id/bids`
- `GET /group-buys/:id/bids`
- `POST /group-buys/:id/select-bid`
- `PATCH /group-buys/:id/participants/:participantId/deposit`
- `POST /group-buys/:id/complete`

The frontend task may use a typed API client and mock responses while backend
endpoints are being developed. It must not silently invent or infer lifecycle
state from missing fields.

### Out of scope

- Database schemas, migrations, or server-side authorization.
- Lifecycle transition logic or quantity validation.
- Real payment processing.
- Server-side Gemini integration.

### Acceptance criteria

- A customer can sign up, create a group buy, browse it, join it, and see
  threshold progress through the UI.
- A producer can view an eligible request, submit a bid, and see matching
  status through the UI.
- The UI distinguishes all lifecycle and deposit states with explicit labels.
- Both QR and manual completion paths are represented.
- API errors, including `401`, `403`, and `409`, produce actionable UI states.
- The frontend can run with documented mock data or against the local API.

## Task 3 — Group-buy and producer backend

### Objective

Implement the group-buy, participation, bidding, matching, and fulfillment
backend used by the frontend task.

### Scope

- Create and browse group buys.
- Filter by controlled produce type and approved location.
- Create participation records and calculate committed/remaining quantity.
- Transition `open` to `funding` on the first successful join.
- Enforce customer ownership, deadlines, valid transitions, positive
  quantities, and selected-bid available-quantity limits.
- Submit and list producer bids.
- Match eligible producers by produce category and service radius.
- Allow only the group-buy owner to select one immutable bid.
- Require the target quantity before transitioning to `matched`.
- Transition a selected group buy to `ready_for_pickup` after fulfillment
  confirmation.
- Record lifecycle events with actor and timestamp.

### Required contract

The task must expose:

- `GET /group-buys?produceType=&locationId=`
- `POST /group-buys`
- `GET /group-buys/:id`
- `POST /group-buys/:id/participants`
- `PATCH /group-buys/:id/status`
- `POST /group-buys/:id/bids`
- `GET /group-buys/:id/bids`
- `POST /group-buys/:id/select-bid`

The group-buy detail response must include lifecycle status, target and
committed quantities, remaining quantity, pickup details, deadlines, selected
bid, current-user participation, deposit summary, and event history.

### Out of scope

- Payment or deposit processing.
- QR scanning or completion confirmation.
- Route optimization or dispatch.
- Gemini pricing estimates.

### Acceptance criteria

- A producer can bid only on an eligible open/funding group buy.
- A customer cannot submit a bid or alter another user's bid.
- The owner cannot select a bid before the quantity threshold is met.
- Selecting a bid changes the group buy to `matched` exactly once.
- Invalid transitions, expired deadlines, and duplicate selections return
  explicit errors rather than silent fallbacks.

## Task 4 — Deposits, pickup completion, events, and comparison widget

### Objective

Implement the reliability and fulfillment surfaces that complete the MVP
journey, including simulated deposits, check-in, event history, and the
optional supermarket comparison widget.

### Scope

- Record a deposit intent when a customer joins.
- Expose the full simulated deposit lifecycle:
  `pending -> confirmed_manual`, with cancellation paths to
  `refunded_manual` or `forfeited_manual` as authorized.
- Clearly label all manual states as non-payment actions.
- Implement QR check-in when available and manual customer/producer check-in
  as fallback.
- Transition participation and group-buy completion only after valid
  fulfillment checks.
- Add event history for state changes with actor, timestamp, and safe payload.
- Implement the optional Gemini benchmark behind a feature flag:
  - normalize produce type and region,
  - request a structured estimated retail range,
  - cache responses with a short TTL,
  - label estimates as approximations,
  - hide unavailable estimates rather than inventing fallback values.

### Required contract

The task must expose:

- `PATCH /group-buys/:id/participants/:participantId/deposit`
- `POST /group-buys/:id/complete`
- A QR check-in endpoint or equivalent documented action.
- A read-only event/history field in the group-buy detail response.
- A comparison endpoint or server-rendered widget only when the feature flag
  is enabled.

### Out of scope

- Real payment capture, refunds, or producer payouts.
- Identity verification or fraud scoring.
- Realtime notifications.
- Arbitrary pickup addresses.

### Acceptance criteria

- Deposit states are persisted and visible to the relevant customer and
  operator, without claiming that money moved.
- Unauthorized users cannot confirm, refund, or forfeit another user's
  deposit.
- A valid QR check-in completes the intended participation; manual check-in
  works when QR is unavailable.
- Repeated completion requests are idempotent.
- Event history contains no secrets or unnecessary personal data.
- If Gemini is unavailable or disabled, the core group-buy flow still works.

## Integration handoff

Each task should finish with:

1. A short implementation note in the agent response describing files changed,
   routes added, migrations, and assumptions.
2. Tests covering its acceptance criteria.
3. Any required seed data or environment variables documented in `README.md`.
4. No duplicated implementation of shared auth, status enums, currency
   handling, or error formats.

The integration owner should run the full happy path:

1. Customer signs up and creates a group buy.
2. Another customer joins and records a pending deposit.
3. Producer submits a bid.
4. The request owner confirms deposits and selects the bid after reaching the
   target.
5. Producer marks fulfillment ready.
6. Participants complete QR or manual check-in.
7. The group buy reaches `completed`, with an inspectable event history.
