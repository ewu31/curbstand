# Curbstand Hackathon Design Doc (MVP)

> **Scope note:** This document describes the smallest demoable product, not a
> production marketplace. Payment processing, identity verification, and
> logistics are intentionally represented by explicit MVP states or manual
> actions.

## 1. Problem
Farmers often face poor economics in current channels:
- **Large distributors** require long travel, waiting, and low margins.
- **Farmers markets** have uncertain demand and direct competition.

Consumers and small restaurants want fresh produce at better prices, but
coordinating direct farm pickup is hard.

## 2. Product Vision
Curbstand is a group-buy platform where customers aggregate demand for produce and farmers fulfill those orders at scheduled pickup points (for example, parking lots).

### Win-win target
- The selected bid price per lb is lower than a comparable supermarket price.
- The producer's selected bid price per lb is higher than the team's chosen
  distribution-center baseline.

These are product goals, not guarantees. The MVP should display the inputs and
comparison basis rather than claim that every transaction achieves both goals.

## 3. MVP Goals
1. **Account creation and login** for:
   - Customers (individuals, restaurants)
   - Producers (farmers)
2. **Create and browse group-buy requests** by produce type.
3. **Farmer bidding** on open group-buy requests (price per lb + quantity offered).
4. **Deposit workflow** for customers to increase attendance reliability.
5. **Order synchronization** so both customer and producer can track status and
   fulfillment.

## 4. Non-Goals (Hackathon MVP)
- Online payment capture, refunds, and producer payouts. The MVP records a
  deposit intent and uses a clearly labeled manual confirmation instead.
- Route optimization and logistics dispatch.
- Mobile native apps.
- Advanced fraud/risk systems.

## 5. Core User Flows

### 5.1 Customer flow
1. Sign up / log in as a customer.
2. Create a group buy by specifying one produce type, a target quantity, a
   pickup location, and a pickup time window.
3. Share or browse the group buy and join it with a requested quantity.
4. Record a deposit intent. The demo marks this as `pending` or
   `confirmed_manual`; it does not move money.
5. Review producer bids and select one before the bid deadline.
6. Receive the matched pickup details once the committed quantity reaches the
   target.
7. Show up at pickup and mark the participation complete.

### 5.2 Farmer flow
1. Sign up / log in as a producer.
2. View open group-buy requests by produce type and location.
3. Submit a bid (price per lb, maximum quantity, and availability window).
4. If selected, confirm fulfillment and pickup schedule.
5. Deliver to the pickup point and mark the handoff complete.

## 6. Functional Requirements

### 6.1 Accounts and roles
- User registration, authentication, and role assignment (`customer`,
  `producer`). A user has exactly one role in the MVP.
- Profile fields:
  - Customer: name, contact, organization type (individual/restaurant).
  - Producer: farm name, contact, produce categories, service radius.

### 6.2 Group-buy lifecycle
- Customer creates request with:
  - Produce type
  - Target quantity in pounds (the minimum quantity needed to proceed, e.g.,
    50 lb)
  - Pickup location
  - Pickup date/time window
- Statuses: `open` -> `funding` -> `matched` -> `ready_for_pickup` ->
  `completed`, with `cancelled` reachable from `open`, `funding`, or `matched`.
- `funding` begins when the first participant joins. A group buy can move to
  `matched` only when committed quantity is at least the target and the
  request owner selects a bid.
- The request owner may close an `open` or `funding` group buy before pickup.
  After `matched`, cancellation is a manual admin action in the MVP.
- Quantity is committed at the participant level. The API must reject joins
  that exceed the selected bid's available quantity once a bid is selected.

### 6.3 Bidding
- Producers place bids on `open` or `funding` requests:
  - Price per lb
  - Available quantity
  - Notes/constraints
- The request owner can view and select one bid. There is no platform-admin
  matching workflow in the MVP.
- A selected bid is immutable for the demo. Changing producer, price, or
  quantity requires cancelling and recreating the group buy.

### 6.4 Deposits
- Customers record a fixed deposit intent at join time. The MVP uses one
  configured amount for every participation; percentage deposits are deferred.
- Deposit status is `pending`, `confirmed_manual`, `refunded_manual`, or
  `forfeited_manual`. No card, bank, or wallet data is stored.
- If the group buy is cancelled before pickup, the UI marks confirmed deposits
  as `refunded_manual`; a real refund is an operator responsibility.
- The MVP must not describe a pending or manual deposit as money collected.

### 6.5 Synchronization
- Shared order state visible to both sides:
  - Quantity committed
  - Quantity remaining to threshold
  - Bid selected
  - Pickup details and status updates
  - Deposit status and last-updated timestamp
- State changes are made through the API and returned in the response. Realtime
  push notifications are out of scope; clients refresh or poll.

## 7. Frontend MVP
- Views:
  1. Authentication (sign in/sign up)
  2. Group-buy marketplace (sorted/filterable by produce type)
  3. Group-buy detail page (threshold progress, bids, participants)
  4. Producer bid submission page
  5. Simple dashboard for each role
- Key UI elements:
  - Produce type tags/categories
  - Progress bar toward minimum threshold (e.g., 50 lb)
  - Bid table sorted by price per lb, with available quantity and pickup
    constraints visible
  - Clear labels for manual deposit confirmation and price estimates

## 8. Backend MVP API (initial contract)

### Auth
- `POST /auth/signup`
- `POST /auth/login`
- `GET /me`

### Group buys
- `GET /group-buys?produceType=`
- `POST /group-buys`
- `GET /group-buys/:id`

### Bids
- `POST /group-buys/:id/bids`
- `GET /group-buys/:id/bids`
- `POST /group-buys/:id/select-bid`

### Participation and status
- `PATCH /group-buys/:id/status`
- `POST /group-buys/:id/participants`
- `PATCH /group-buys/:id/participants/:participantId/deposit`
- `POST /group-buys/:id/complete`

The API should return `401` for unauthenticated requests, `403` for an
authenticated user without the required role or ownership, and `409` for
invalid lifecycle transitions. Request and response schemas should include
units (`lbs`, USD) and timestamps; clients must not infer state from a
missing field.

## 9. Data Model (MVP)
- `users` (id, role, name, email, password_hash, org_type, created_at)
- `producer_profiles` (user_id, farm_name, produce_types, service_radius_miles)
- `group_buys` (id, produce_type, target_lbs, pickup_location, pickup_window_start, pickup_window_end, status, join_deadline, bid_deadline, created_by, selected_bid_id, created_at, updated_at)
- `group_buy_participants` (id, group_buy_id, user_id, requested_lbs, deposit_amount, deposit_status, completion_status, created_at, updated_at)
- `bids` (id, group_buy_id, producer_id, price_per_lb, available_lbs, availability_window_start, availability_window_end, notes, status, created_at)
- `events` (id, group_buy_id, actor_user_id, event_type, payload, created_at)

`deposit_amount` is a decimal currency value and `price_per_lb` is a decimal
currency value; neither should be represented as a floating-point value in
storage. `produce_type` is a controlled category in the MVP rather than free
text so filtering and bid matching are deterministic.

## 10. Stretch Goal: Gemini Supermarket Price Benchmark
Integrate a Gemini-powered pricing assistant to estimate current supermarket price ranges for produce categories.

### Purpose
- Show users a "market comparison" indicator:
  - **Group-buy price**
  - **Estimated supermarket price**
  - **Farmer uplift vs. distribution-center baseline** (manual baseline input initially)

### Proposed flow
1. Normalize produce query (`produce_type`, region).
2. Call Gemini API with structured prompt to return an estimated retail range.
3. Cache responses for a short TTL to limit API cost.
4. Display a lightweight comparison widget on group-buy detail pages.

### Guardrails
- Label estimates clearly as approximations.
- Store prompt/response metadata for auditability, but do not store secrets or
  unnecessary personal data.
- If Gemini is unavailable, hide the estimate and show the last successful
  retrieval timestamp; do not substitute a fabricated or stale value without
  labeling it.

## 11. Success Criteria (Hackathon)
- A customer can create/join a produce group-buy and record a clearly labeled
  deposit intent.
- A farmer can bid on an open request.
- One request can be matched and moved to ready-for-pickup status.
- UI visibly sorts and filters by produce type.
- Optional: supermarket comparison widget renders for at least one produce category.

## 12. Decisions required before implementation

These are not implementation details; each changes the user experience or
data model.

1. **Geographic scope — resolved:** The demo targets Seattle / Puget Sound,
   uses USD, and uses Pacific Time. The produce catalog and pickup-location
   validation can remain intentionally small and mocked.
2. **Pickup location privacy — resolved:** Group-buy owners choose from an
   approved list of public pickup locations. The MVP does not accept arbitrary
   addresses or expose a participant's private address.
3. **Completion verification — resolved:** Support QR check-in when available,
   with explicit manual customer/producer check-in as the fallback.
4. **Join and bid deadlines — resolved:** Both are required fields with
   sensible defaults. The API rejects joins or bids after the relevant
   deadline, even if the lifecycle status has not yet been advanced.
5. **Deposit demo behavior — resolved:** Show the full
   `pending`/`confirmed_manual`/`refunded_manual`/`forfeited_manual` lifecycle.
   These states are operator-controlled in the MVP and never imply that the
   application moved money.

The doc now assumes the request owner selects the bid, deposits are simulated,
Seattle / Puget Sound is the demo geography, deadlines are enforced, and
completion supports QR with manual fallback. These assumptions should be
treated as implementation constraints rather than left implicit.
