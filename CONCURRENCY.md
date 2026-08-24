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

## Hold expiry: approach and failure mode

Expired holds are freed two ways, deliberately overlapping:

1. **Background reaper** (`src/utils/reaper.js`) — every 30s, `UPDATE holds SET
   status = 'expired' WHERE status = 'active' AND expires_at <= now()`. This
   is what makes an expired hold's slot show up again in `GET
   /availability/free-slots`, since that query filters on `status = 'active'`.
2. **Expiry-aware confirm** (`src/routes/holds.js`, `POST
   /holds/:holdId/confirm`) — the confirm transaction re-checks `status =
   'active' AND expires_at > now()` itself, under `FOR UPDATE`, regardless of
   whether the reaper has run yet.

**Failure mode if the reaper dies:** the `holds` row is never flipped to
`'expired'`, so the slot keeps appearing *unavailable* in the free-slots
query even though the hold is functionally dead — a false "still held" for
anyone browsing. It does **not** cause a double-booking or a stuck slot
forever: the confirm endpoint's own `expires_at > now()` check is
independent of the reaper and still correctly rejects a confirm on a
dead hold with `410`, and a fresh `POST /holds` on that same slot succeeds
immediately once `expires_at` has passed, because the `EXCLUDE` constraint
is scoped to `WHERE (status = 'active')` — an expired-but-not-yet-reaped row
still counts as `'active'` in that partial constraint, however, so a new
hold attempt on the exact same slot *would* still conflict until the reaper
(or a confirm attempt on the old hold) flips its status. Net effect of the
reaper being down: browsing shows stale unavailability and a re-hold on the
identical slot can 409 until it catches up — never data corruption.

## What happens if the constraint is removed

Dropping the `EXCLUDE` constraint (`ALTER TABLE bookings DROP CONSTRAINT
bookings_resource_id_slot_excl;`) and re-running the concurrency script would
allow multiple concurrent `INSERT`s to succeed for the same resource and
overlapping slot, since nothing at the database level would reject them —
the API's `409` handling only fires on the `23P01` exclusion-violation error
code, so without the constraint every one of the 50 requests would return
`201` and 50 overlapping rows would exist.