# SlotLock — Resource Booking & Scheduling Engine

Resource booking system (clinic/studio style) that guarantees a slot can
never be double-booked, handles timezones and DST correctly, and supports
holds, idempotent booking creation, and an append-only payment ledger.

## Stack

- Frontend: React.js + Material UI (in progress)
- Backend: Node.js + Express (ES Modules)
- Database: PostgreSQL — uses an `EXCLUDE` constraint with `tstzrange` + GiST
  for double-booking prevention, a feature not available in MySQL, which is
  why Postgres was chosen over MySQL despite both being listed as options.

## Setup

### 1. Prerequisites
- Node.js
- PostgreSQL installed locally (pgAdmin or `psql`)

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Create the database
Open pgAdmin (or `psql`) and create a database named `slotlock`.

### 4. Enable extension and create schema
Open the Query Tool on the `slotlock` database and run the full contents of:
```
backend/src/db/schema.sql
```
This creates all tables and the `EXCLUDE` constraint on `bookings` and
`holds`, and enables the `btree_gist` extension.

### 5. Configure environment variables
Copy `.env.example` to `.env` inside `backend/` and set your local Postgres
password:
```
PORT=5000
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/slotlock
```

### 6. Run the backend
```bash
npm run dev
```
Server runs at `http://localhost:5000`. Verify with:
```
GET http://localhost:5000/health
GET http://localhost:5000/db-test
```

### 7. Seed data
Populates 3 resources across 2 timezones (one DST-observing, one not), 90
days of recurring availability, and ~5000 bookings:
```bash
node scripts/seed.js
```

### 8. Run tests
```bash
npm test
```
Covers DST spring-forward/fall-back detection, double-booking rejection at
the DB level, and the refund-guard logic.

### 9. Run the concurrency proof
With the server running, in a separate terminal:
```bash
node scripts/concurrency-test.js
```
See `CONCURRENCY.md` for the expected output and explanation.

## API Endpoints

Full request/response details are in `API_ENDPOINTS.md`. Summary:

| Method | Endpoint | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /db-test | Verifies DB connection |
| POST | /resources | Create a resource |
| GET | /resources | List resources |
| POST | /bookings | Create a booking (409 on conflict, supports Idempotency-Key) |
| GET | /bookings | List bookings |
| GET | /bookings/:id | Get a single booking (role-based, 404 not 403) |
| POST | /availability/rules | Create a recurring availability rule |
| GET | /availability/free-slots/:resourceId | Free slots for next 30 days (SQL-computed) |
| POST | /availability/blackouts | Add a blackout (subtracts availability) |
| POST | /availability/one-off | Add one-off extra availability |
| POST | /holds | Create a 5-minute hold on a slot |
| POST | /holds/:holdId/confirm | Atomically convert a hold into a booking |
| POST | /ledger/charge | Record a charge against a booking |
| GET | /ledger/balance/:bookingId | Derived balance (never stored) |
| POST | /ledger/cancel/:bookingId | Cancel + policy-driven refund |

## Authorization

Roles (`admin`, `staff`, `customer`) are enforced via `x-user-role` and
`x-user-id` headers during development, ahead of adding real authentication.
A `customer` requesting another customer's booking gets `404`, not `403`, so
the booking's existence is never leaked to someone who isn't authorized to
see it.

## What I cut and why

- **Recurrence rules** are limited to weekly `byday` patterns (e.g. "every
  Monday 9–5"). Monthly/yearly RRULE patterns and complex recurrence
  exceptions beyond blackouts/one-offs were not implemented, to keep the
  core time-correctness and double-booking guarantees the priority within
  the time available.
- **Payment gateway integration** is mocked — the ledger records charges
  and refunds as plain amounts with no real payment processor call, per the
  assignment's explicit scope (deployment, Docker, CI, and real payment
  integration were called out as out of scope).
- **Authentication** uses header-based role simulation (`x-user-role`,
  `x-user-id`) rather than real login/JWT, since the focus of the assignment
  is the booking/concurrency/time engine, not an auth system. Authorization
  logic itself (the 404-not-403 rule, role checks) is fully implemented.
- **Deployment, Docker, CI, email/SMS, and mobile** were intentionally not
  attempted, per the assignment's explicit "out of scope" list — time was
  spent instead on the core rubric items (time correctness, double-booking,
  recurrence, holds, ledger).
- **Frontend visual polish** was deprioritized in favor of backend
  correctness, per the rubric weighting (80 of 100 points are backend
  correctness vs. 10 for frontend rigour).