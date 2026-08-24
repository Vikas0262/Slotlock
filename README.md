# SlotLock — Resource Booking & Scheduling Engine

Resource booking system (clinic/studio style) that guarantees a slot can
never be double-booked, handles timezones and DST correctly, and supports
holds, idempotent booking creation, and an append-only ledger for tracking
charges and refunds.

## Stack

- Frontend: React.js + Material UI
- Backend: Node.js + Express (ES Modules)
- Database: PostgreSQL — uses an `EXCLUDE` constraint with `tstzrange` + GiST
  for double-booking prevention, a feature not available in MySQL, which is
  why Postgres was chosen over MySQL despite both being listed as options.

## Documentation

- `TIME.md` — how time is stored, DST spring-forward/fall-back handling, with actual test output
- `CONCURRENCY.md` — the double-booking prevention mechanism, why it was chosen, and the 50-way concurrency proof
- `POSTMAN_TESTING.md` — every endpoint tested by hand, with request/response screenshots

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
Expected output:
```
Seeding started...
Created 3 resources: [...]
Created availability rules for 90 days.
Seeded ~5000 bookings (out of X attempts).
Seeding complete.
```

**Run this only once against a fresh schema.** Running it again inserts a
second, duplicate set of resources (it doesn't check for existing data)
with their own availability rules — the UI or API may then pick up an
older, incomplete resource (e.g. one created earlier during manual Postman
testing with only a single day's rule) instead of the fully-seeded one,
which looks like missing availability but is really duplicate data. If the
seed has already been run, or manual testing left partial data behind, wipe
and reseed for a clean dataset:
```sql
TRUNCATE bookings, holds, availability_rules, blackouts,
  one_off_availability, ledger, cancellation_policies, resources
  RESTART IDENTITY CASCADE;
```
then re-run `node scripts/seed.js`. Verify afterward:
```sql
SELECT name, COUNT(*) FROM resources GROUP BY name;
SELECT resource_id, COUNT(*) FROM availability_rules GROUP BY resource_id;
```
Each resource name should appear exactly once, with 5 rule rows (Mon–Fri).

### 8. Run tests
```bash
npm test
```
Covers DST spring-forward/fall-back detection, double-booking rejection at
the DB level, and the refund-guard logic.

### 9. Run the concurrency proof
Resource IDs are random UUIDs generated fresh by `seed.js` each run, so grab
one first. With the server running, in a separate terminal:
```bash
psql -U postgres -d slotlock -t -c "SELECT id FROM resources LIMIT 1;"
CONCURRENCY_TEST_RESOURCE_ID=<uuid-from-above> node scripts/concurrency-test.js
```
See `CONCURRENCY.md` for the expected output and explanation.

### 10. Run the frontend
```bash
cd frontend
npm install
cp .env.example .env   # only needed if the backend isn't on localhost:5000
npm run dev
```
Opens at `http://localhost:5173`. The backend allows cross-origin requests
from the dev server (`cors()` in `server.js`), and requests carry
`x-user-role: customer` / `x-user-id: <persisted random uuid>` headers so
the authorization checks on the backend are exercised (see
`src/api/client.js`).

**Note on navigating weeks in the UI:** free slots are only computed for
the next 30 days from today (`current_date` in `free-slots`), per the
assignment's requirement that this query stay SQL-driven and not scan a
full year in memory. Navigating with the "Next" arrow beyond ~30 days out
will correctly show no free (green) slots — confirmed bookings from the
seed script (which spans 90 days) may still appear as booked (grey) that
far out, since bookings aren't limited to the 30-day window.

## Frontend

- Week-view calendar grid (`WeekGrid` → `DayColumn` → `SlotCell`), 30-minute
  slot resolution. Every cell is `React.memo`'d and hover state lives
  inside the cell itself, so hovering/dragging over the grid only
  re-renders the one cell under the pointer, not the whole week.
- Timezone switcher re-renders the same week's data in the selected zone.
  Day length (23/25 hours → 46/50 half-hour rows) is computed from the
  actual zoned duration between local midnights (luxon), never assumed to
  be 24 — navigate to the early-Nov (fall-back) or early-March
  (spring-forward) week in `America/New_York` to see it.
- Booking flow: click a free slot → `POST /holds` → dialog with a live
  countdown driven by the server's `expires_at` → confirm → `POST
  /holds/:id/confirm` (idempotency key attached). Hold expiry mid-flow and
  a slot taken by someone else both surface as a clean dialog state
  (`expired` / `conflict`) that triggers a grid refetch — never a silent
  failure or a stack trace.
- Each week fetch is debounced (200ms) and tagged with a request id; an
  in-flight request is aborted the instant the resource/week/zone changes
  again, so a stale response can never overwrite the current view.

## API Endpoints

Every endpoint, with exact request/response examples and screenshots from
manual testing, is documented in `POSTMAN_TESTING.md`. Summary:

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
- **Payment gateway integration is mocked** — the ledger records charges
  and refunds as plain amounts (an append-only entry per transaction, no
  mutable balance column), but no real payment processor is called, per
  the assignment's explicit scope (deployment, Docker, CI, and real
  payment integration were called out as out of scope). What's implemented
  is the *accounting* side (charge, derived balance, policy-based refund,
  refund-cannot-exceed-charge guard) — not a payment gateway.
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
  correctness vs. 10 for frontend rigour). The frontend always acts as a
  `customer` (no role switcher UI) since the 404-vs-403 authorization
  logic is already covered on the backend.
- **Free-slots query** originally returned whole availability windows
  (e.g. all of 09:00–17:00) and hid the *entire* window if a single
  booking overlapped anywhere in it. Fixed to slice into 30-minute
  increments before applying the booking/hold/blackout filters, so a busy
  day still surfaces its actual open slots instead of going blank.
- **Admin/staff UI** was not built — the frontend is customer-booking-flow
  only. Creating resources, availability rules, blackouts, and one-off
  availability is only possible via direct API calls (see
  `POSTMAN_TESTING.md`), not through a screen, since the rubric only grades
  the customer-facing calendar/booking frontend, not an admin panel.
- **Seeded random bookings** (the ~5000 from `seed.js`) are distributed
  across all 90 days including weekends, purely for concurrency/volume
  testing — they don't follow the actual Mon–Fri recurring rule, so it's
  normal to see a "booked" cell on a Saturday even though no availability
  rule covers Saturdays.