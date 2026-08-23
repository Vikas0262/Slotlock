# API_ENDPOINTS.md — SlotLock Backend Reference

Base URL (local): `http://localhost:5000`

---

## Health / DB

### `GET /health`
Health check.
**Response:** `{ "status": "ok" }`

### `GET /db-test`
Verifies DB connection.
**Response:** `{ "connected": true, "time": "..." }`

---

## Resources

### `POST /resources`
Create a resource (doctor/room/machine).
**Body:**
```json
{ "name": "Dr. Rao", "iana_timezone": "Asia/Kolkata" }
```
**Response:** `201` — resource object with `id`

### `GET /resources`
List all resources.
**Response:** `200` — array of resource objects

---

## Bookings

### `POST /bookings`
Create a booking. Fails with `409` if the slot overlaps an existing confirmed
booking for the same resource (DB-level `EXCLUDE` constraint).

Supports `Idempotency-Key` header — same key + same request body returns the
same response without creating a duplicate booking.

**Headers (optional):**
```
Idempotency-Key: <any unique string>
```
**Body:**
```json
{
  "resource_id": "<uuid>",
  "customer_id": "<uuid>",
  "start_utc": "2026-09-01T04:00:00Z",
  "end_utc": "2026-09-01T04:30:00Z"
}
```
**Response:** `201` (created) or `409` (`{ "error": "Slot already booked" }`)

### `GET /bookings`
List all bookings.
**Response:** `200` — array of booking objects

### `GET /bookings/:id`
Get a single booking. Requires `x-user-role` and `x-user-id` headers.
- `admin` / `staff` can access any booking.
- `customer` can only access a booking where `customer_id` matches their
  own `x-user-id` — otherwise **`404`**, not `403`, so the booking's
  existence is never revealed to an unauthorized customer.
- Missing or unrecognized role → `403 Forbidden`.

**Headers:**
```
x-user-role: customer | staff | admin
x-user-id: <uuid>
```
**Response:** `200` (booking object), `404` (`{ "error": "Not found" }`),
or `403` (`{ "error": "Forbidden" }`)

---

## Availability

### `POST /availability/rules`
Create a recurring weekly availability rule (authored in local wall-clock time).
**Body:**
```json
{
  "resource_id": "<uuid>",
  "byday": "MON",
  "start_local_time": "09:00",
  "end_local_time": "17:00",
  "effective_from": "2026-08-01",
  "effective_until": "2026-12-31"
}
```
**Response:** `201` — rule object

### `GET /availability/free-slots/:resourceId`
Returns free slots for the next 30 days (computed entirely in SQL — recurrence
minus blackouts minus existing bookings).
**Response:** `200` — array of `{ start_utc, end_utc }`

### `POST /availability/blackouts`
Create a blackout (subtracts from availability — holiday/leave).
**Body:**
```json
{
  "resource_id": "<uuid>",
  "start_utc": "2026-08-31T00:00:00Z",
  "end_utc": "2026-09-01T00:00:00Z",
  "reason": "Public holiday"
}
```
**Response:** `201` — blackout object

### `POST /availability/one-off`
Create one-off extra availability (adds to it).
**Body:**
```json
{
  "resource_id": "<uuid>",
  "start_utc": "2026-09-06T04:00:00Z",
  "end_utc": "2026-09-06T08:00:00Z"
}
```
**Response:** `201` — one-off availability object

---

## Holds

### `POST /holds`
Reserve a slot for 5 minutes. Fails `409` if the slot is already actively
held or booked.
**Body:**
```json
{
  "resource_id": "<uuid>",
  "customer_id": "<uuid>",
  "start_utc": "2026-09-05T04:00:00Z",
  "end_utc": "2026-09-05T04:30:00Z"
}
```
**Response:** `201` — hold object with `expires_at`

### `POST /holds/:holdId/confirm`
Atomically convert an active, non-expired hold into a confirmed booking
(single DB transaction — no window where the slot is neither held nor
booked).
**Response:** `201` (booking created), `410` (`{ "error": "Hold expired or
not found" }`), or `409` if the slot got booked by someone else in the
meantime.

---

## Ledger

### `POST /ledger/charge`
Record a charge against a booking (append-only — no mutable balance column
anywhere).
**Body:**
```json
{ "booking_id": "<uuid>", "amount": 500 }
```
**Response:** `201` — ledger entry object

### `GET /ledger/balance/:bookingId`
Derived balance for a booking (`SUM` of all ledger entries at query time —
never a stored column).
**Response:** `200` — `{ "balance": "500" }`

### `POST /ledger/cancel/:bookingId`
Cancel a booking and issue a refund per the resource's cancellation policy
(config-driven via `cancellation_policies`, not a hardcoded if/else chain).
Guards against refunding more than what was charged.
**Response:** `200` — `{ "refunded": <amount>, "refund_pct": <pct>,
"hours_before_start": <n> }`, `400` if the refund would exceed the charged
amount, or `404` if the booking doesn't exist.

---

## Notes

- All timestamps are UTC (`...Z` suffix) unless explicitly marked "local".
- IDs are UUIDs (Postgres `gen_random_uuid()`).
- `409` = conflict (slot taken). `410` = gone (hold expired). `404` = not
  found or hidden for authorization reasons. `403` = missing/invalid role.
- Seed script (`scripts/seed.js`) and concurrency proof
  (`scripts/concurrency-test.js`) are documented in `README.md` and
  `CONCURRENCY.md` respectively.