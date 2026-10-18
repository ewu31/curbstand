# Curbstand Hackathon Design Doc (MVP)

## 1. Problem
Farmers often face poor economics in current channels:
- **Large distributors** require long travel, waiting, and low margins.
- **Farmers markets** have uncertain demand and direct competition.

Consumers and small restaurants want fresh produce at better prices, but coordinating direct farm pickup is hard.

## 2. Product Vision
Curbstand is a group-buy platform where customers aggregate demand for produce and farmers fulfill those orders at scheduled pickup points (for example, parking lots).

### Win-win target
- Customer price per lb is lower than supermarket prices.
- Farmer payout per lb is higher than typical distribution-center payouts.

## 3. MVP Goals
1. **Account creation and login** for:
   - Customers (individuals, restaurants)
   - Producers (farmers)
2. **Create and browse group-buy requests** by produce type.
3. **Farmer bidding** on open group-buy requests (price per lb + quantity offered).
4. **Deposit workflow** for customers to increase attendance reliability.
5. **Order synchronization** so both customer and producer can track status and fulfillment.

## 4. Non-Goals (Hackathon MVP)
- Full payment settlement and payouts.
- Route optimization and logistics dispatch.
- Mobile native apps.
- Advanced fraud/risk systems.

## 5. Core User Flows

### 5.1 Customer flow
1. Sign up / log in.
2. Browse open group buys sorted by produce type.
3. Join a group buy and place a quantity request.
4. Put down a deposit.
5. Receive updates when a farmer bid is accepted and minimum quantity is met.
6. Show up at pickup point and complete the transaction.

### 5.2 Farmer flow
1. Sign up / log in as producer.
2. View open group-buy requests by produce type and location.
3. Submit bid (price per lb, max quantity, availability window).
4. If selected, confirm fulfillment and pickup schedule.
5. Deliver to pickup point and complete handoff.

## 6. Functional Requirements

### 6.1 Accounts and roles
- User registration, authentication, and role assignment (`customer`, `producer`).
- Profile fields:
  - Customer: name, contact, organization type (individual/restaurant).
  - Producer: farm name, contact, produce categories, service radius.

### 6.2 Group-buy request lifecycle
- Customer creates request with:
  - Produce type
  - Desired total quantity target (minimum threshold, e.g., 50 lb)
  - Pickup location
  - Pickup date/time window
- Statuses: `open` -> `funding` (deposits) -> `matched` (farmer selected) -> `ready_for_pickup` -> `completed` (or `cancelled`).

### 6.3 Bidding
- Producers place bids on `open` requests:
  - Price per lb
  - Available quantity
  - Notes/constraints
- Customers (or request owner) can view and accept a bid.

### 6.4 Deposits
- Customers place a deposit at join time (flat or percentage).
- Deposit recorded against participation.
- If request fails to meet threshold or is cancelled, deposit is refundable.

### 6.5 Synchronization
- Shared order state visible to both sides:
  - Quantity committed
  - Quantity remaining to threshold
  - Bid selected
  - Pickup details and status updates

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
  - Bid table sorted by effective price per lb

## 8. Backend MVP API (initial contract)

### Auth
- `POST /auth/signup`
- `POST /auth/login`
- `GET /me`

### Group buys
- `GET /group-buys?produceType=`
- `POST /group-buys`
- `GET /group-buys/:id`
- `POST /group-buys/:id/join`
- `POST /group-buys/:id/deposit`

### Bids
- `POST /group-buys/:id/bids`
- `GET /group-buys/:id/bids`
- `POST /group-buys/:id/select-bid`

## 9. Data Model (MVP)
- `users` (id, role, name, email, password_hash, org_type, created_at)
- `producer_profiles` (user_id, farm_name, produce_types, service_radius_miles)
- `group_buys` (id, produce_type, target_lbs, pickup_location, pickup_window_start, pickup_window_end, status, created_by)
- `group_buy_participants` (group_buy_id, user_id, requested_lbs, deposit_amount, deposit_status)
- `bids` (id, group_buy_id, producer_id, price_per_lb, available_lbs, notes, status)
- `events` (id, group_buy_id, event_type, payload, created_at)

## 10. Stretch Goal: Gemini Supermarket Price Benchmark
Integrate a Gemini-powered pricing assistant to estimate current supermarket price ranges for produce categories.

### Purpose
- Show users a "market comparison" indicator:
  - **Group-buy price**
  - **Estimated supermarket price**
  - **Farmer uplift vs. distribution-center baseline** (manual baseline input initially)

### Proposed flow
1. Normalize produce query (`produce_type`, region).
2. Call Gemini API with structured prompt to return estimated retail range.
3. Cache responses for a short TTL to limit API cost.
4. Display a lightweight comparison widget on group-buy detail pages.

### Guardrails
- Label estimates clearly as approximations.
- Store prompt/response metadata for auditability.
- Add fallback behavior if Gemini is unavailable.

## 11. Success Criteria (Hackathon)
- A customer can create/join a produce group-buy and place deposit.
- A farmer can bid on an open request.
- One request can be matched and moved to ready-for-pickup status.
- UI visibly sorts and filters by produce type.
- Optional: supermarket comparison widget renders for at least one produce category.

## 12. Open Questions
1. Who can accept a producer bid (request creator vs. platform admin)?
2. Deposit policy details (flat fee vs. percentage, forfeiture rules).
3. How to verify pickup completion in MVP (QR, manual check-in, both)?
4. Initial geographic scope and location constraints.
