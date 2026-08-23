# CONCURRENCY.md — Double-Booking Prevention

## Mechanism chosen: Postgres `EXCLUDE` constraint

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id),
  customer_id UUID NOT NULL,
  slot TSTZRANGE NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now(),

  EXCLUDE USING GIST (
    resource_id WITH =,
    slot WITH &&
  ) WHERE (status = 'confirmed')
);
```

`btree_gist` is enabled to allow the equality check on `resource_id` (a
non-range column) to participate in a GiST exclusion constraint alongside the
range overlap check on `slot`.

## Why this instead of check-then-insert

A `SELECT ... WHERE NOT EXISTS` check followed by an `INSERT` is a race
condition, not a guarantee: two concurrent requests can both run the `SELECT`
before either has inserted, both see the slot as free, and both proceed to
`INSERT` — resulting in two overlapping bookings. This is a classic
time-of-check-to-time-of-use (TOCTOU) bug. It cannot be reliably fixed at the
application layer without also serializing access, which defeats the purpose
of concurrent request handling.

The `EXCLUDE` constraint instead enforces the invariant **inside the
database's own insert path** — Postgres checks the GiST index for an
overlapping range on the same `resource_id` as part of the same atomic
operation that performs the insert. There is no window between "check" and
"write" for a second request to sneak in. A violation raises Postgres error
code `23P01`, which the API layer catches and maps to a clean `409 Conflict`.

## 50-way concurrency proof

Script: `backend/scripts/concurrency-test.js` — fires 50 `POST /bookings`
requests at the exact same resource + time slot simultaneously using
`Promise.all`, then tallies the response statuses.

Run with the backend server running locally:
```bash
node scripts/concurrency-test.js
```

**Actual output:**
```
Success (201): 1
Conflict (409): 49
Other/unexpected: []
```

Exactly one request succeeded, the other 49 received a clean `409`, and there
were no crashes, hangs, or unexpected status codes. Verified independently in
the database — querying `bookings` for that resource and time slot returns
exactly one row.

## What happens if the constraint is removed

Dropping the `EXCLUDE` constraint (`ALTER TABLE bookings DROP CONSTRAINT
bookings_resource_id_slot_excl;`) and re-running the concurrency script would
allow multiple concurrent `INSERT`s to succeed for the same resource and
overlapping slot, since nothing at the database level would reject them —
the API's `409` handling only fires on the `23P01` exclusion-violation error
code, so without the constraint every one of the 50 requests would return
`201` and 50 overlapping rows would exist.