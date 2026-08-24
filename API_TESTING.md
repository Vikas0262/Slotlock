# API Testing Notes

This is where I tested every endpoint by hand before considering it done.

I went through these in order because the later ones depend on IDs the
earlier ones create (a resource ID, a booking ID, a hold ID). If you're
retracing these steps yourself, do the same.

Base URL: `http://localhost:5000`

---

## Health and DB check

Nothing fancy here, just making sure the server's actually up and talking
to Postgres before testing anything real.

`GET /health` → `{ "status": "ok" }`

![health check](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514906/1_hx4s88.png)

`GET /db-test` → `{ "connected": true, "time": "..." }`

![db connection test](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514906/2_vsfb6p.png)

---

## Resources

Created two resources up front — one in India (no DST, ever) and one in
New York (does observe DST). Everything about time correctness later
depends on having both.

`POST /resources`
```json
{ "name": "Dr. Anjali Mehta", "iana_timezone": "Asia/Kolkata" }
```
Got back a `201` with a generated UUID.

![creating Dr. Anjali Mehta](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/3_avoqnq.png)

```json
{ "name": "Dr. Rohan Kapoor", "iana_timezone": "America/New_York" }
```
Same, `201`.

![creating Dr. Rohan Kapoor](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/4_ibqdet.png)

`GET /resources` — both show up with their timezones intact.

![listing both resources](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/5_ytxqtx.png)

Copy the two `id` values from here — you'll need them for basically
everything below (`anjali_id`, `rohan_id`).

---

## Bookings — and the double-booking check

This is the part the whole assignment is really about, so I tested it
carefully rather than just once.

First, a normal booking:
```json
{
  "resource_id": "<anjali_id>",
  "customer_id": "3f9a2b10-6d4e-4c2a-8b1f-7e5d9a4c2e11",
  "start_utc": "2026-09-01T04:00:00Z",
  "end_utc": "2026-09-01T04:30:00Z"
}
```
`201`, confirmed.

![first booking created](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/6_b1rdu6.png)

Then I sent the *exact same request again*. This time: `409`, `"Slot
already booked"`. That 409 isn't coming from an if-check in my code — it's
Postgres itself rejecting the insert because of the `EXCLUDE` constraint on
the table. I made sure of that by checking the error code in the response
(`23P01`), which is Postgres's own exclusion-violation code, not something
I invented.

![duplicate booking rejected with 409](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/7_pqdlos.png)

Next I tested the idempotency key — sent a booking request with an
`Idempotency-Key` header attached.

![request with idempotency key](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514908/8_adavu7.png)

I sent this same request a second time with the identical key, and got the
identical response back — no new row was created for it (checked the count
directly in pgAdmin). Since the two responses are byte-for-byte the same,
I've only kept one screenshot of it above; the interesting part is that
resending it doesn't create a duplicate booking, not that the screen looks
different the second time.

`GET /bookings` just lists everything — used this constantly while testing
to sanity-check what had actually landed in the table.

![listing all bookings](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/9_xswmr5.png)

---

## The 50-way concurrency test

Postman can't really fire 50 requests at the exact same instant, so this
one lives in its own script (`backend/scripts/concurrency-test.js`) instead
of Postman. I'm including it here anyway since it's really the same kind of
test as the one above, just under real load instead of two manual clicks.

```bash
node scripts/concurrency-test.js
```

```
Success (201): 1
Conflict (409): 49
Other/unexpected: []
```

One request wins, forty-nine get a clean conflict response, nothing
crashes or hangs. Full writeup of why this works (and what would break
without the constraint) is in `CONCURRENCY.md`.

![concurrency test terminal output](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/10_lwdpna.png)

---

## Availability — rules, blackouts, free slots

Created a Monday-to-Friday, 9-to-5 rule for Dr. Anjali Mehta, in her local time:

```json
{
  "resource_id": "<anjali_id>",
  "byday": "MON",
  "start_local_time": "09:00",
  "end_local_time": "17:00",
  "effective_from": "2026-08-01",
  "effective_until": "2026-12-31"
}
```
Repeated for the other four weekdays.

![creating a recurring availability rule](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514907/11_pqm5im.png)

Then `GET /availability/free-slots/<anjali_id>` — got back a list of UTC
timestamps for the next 30 days, weekdays only. Checked the math by hand
for one of them: 09:00 IST is UTC+5:30, so it should come back as 03:30
UTC, and it did.

![free slots for Dr. Anjali Mehta before any changes](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514908/12_ehh3wh.png)

Added a blackout for one specific day (a "holiday"):
```json
{
  "resource_id": "<anjali_id>",
  "start_utc": "2026-09-07T00:00:00Z",
  "end_utc": "2026-09-08T00:00:00Z",
  "reason": "Ganesh Chaturthi — clinic closed"
}
```

![creating a blackout](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514908/13_azlumb.png)

Re-running the free-slots query after this is a straightforward repeat of
the request above with the blacked-out date now excluded from the results
— I didn't keep a separate screenshot for it since it's the same endpoint,
same call, just a shorter list. The blackout logic itself is a `NOT EXISTS`
check against the `blackouts` table in `availability.js` if you want to see
exactly how it's excluded.

---

## Holds

Placed a hold on a slot, got back an `expires_at` roughly 5 minutes out.

![hold created with a 5-minute expiry](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514908/14_bhxacd.png)

I separately tested what happens once a hold's expiry passes — shortened
the interval temporarily in `holds.js` to make this practical to test,
then called confirm on it after the window closed, and got a clean `410`
instead of a crash or a silent success. I didn't screenshot that one
specifically, but it's covered by an automated test instead
(`backend/tests/holds.test.js`, part of the `npm test` suite) — so it's
verified on every test run, not just the one time I checked it manually.

The conversion itself happens inside a single DB transaction with a
row lock, so there's no window where a slot is neither held nor booked —
that's in `holds.js` if you want to see the actual query.

---

## Ledger and refunds

Recorded a charge against a booking:
```json
{ "booking_id": "<booking_id>", "amount": 500 }
```

![charge recorded against a booking](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514908/15_qoucgd.png)

Checked the balance — `500`, computed live with a `SUM()` over the ledger
table, not read from any stored balance field (there isn't one).

Cancelled the booking, and the refund amount came back matching whichever
policy tier applied based on how far out the booking was.

![cancelling the booking returns a policy-based refund amount](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514908/16_wvag4e.png)

Checked the balance again afterward — it had dropped by exactly the
refund amount.

![balance reflects charge minus refund](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514909/18_h87his.png)

I also tried cancelling the same booking a second time, which should be
rejected since it's already been fully refunded — got a `400`, "refund
would exceed charged amount." Like the hold-expiry case above, I didn't
grab a screenshot of this specific attempt, but the same guard is covered
by `backend/tests/ledger.test.js` in the automated suite, so it's checked
every time `npm test` runs, not just this once.

---

## Authorization

Tested this with the `x-user-role` / `x-user-id` headers, since there's no
real login system yet.

As the customer who actually owns a booking: `200`, full booking data.

![owning customer sees their own booking](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514936/20_tnxhs7.png)

As a *different* customer trying to view the same booking: `404`, not
`403` — the point being that an unauthorized customer shouldn't even be
able to tell the booking exists.

![a different customer gets 404, not 403](https://res.cloudinary.com/ds2p850qj/image/upload/v1787514936/19_vkoudg.png)

I didn't screenshot the admin-role and missing-role-header cases
separately — same endpoint, same `requireRole` middleware, just a
different header value each time — but both are one-line checks in
`src/middleware/auth.js` and `src/routes/bookings.js` if you want to trace
through them.

---

## All API endpoints

| Method | Endpoint | Auth needed? | Notes |
|---|---|---|---|
| GET | /health | No | Health check |
| GET | /db-test | No | Verifies DB connection |
| POST | /resources | No | Create a resource |
| GET | /resources | No | List resources |
| POST | /bookings | No | Create a booking — `409` on conflict, `Idempotency-Key` header optional |
| GET | /bookings | No | List bookings |
| GET | /bookings/:id | Yes — `x-user-role`, `x-user-id` | Single booking — returns `404` (not `403`) if a customer requests someone else's booking |
| POST | /availability/rules | No | Create a recurring weekly availability rule |
| GET | /availability/free-slots/:resourceId | No | Free slots for the next 30 days, computed in SQL |
| POST | /availability/blackouts | No | Add a blackout (subtracts availability) |
| POST | /availability/one-off | No | Add one-off extra availability |
| POST | /holds | No | Create a 5-minute hold on a slot — `409` if already held/booked |
| POST | /holds/:holdId/confirm | No | Atomically convert a hold into a booking — `410` if expired |
| POST | /ledger/charge | No | Record a charge against a booking |
| GET | /ledger/balance/:bookingId | No | Derived balance (never a stored column) |
| POST | /ledger/cancel/:bookingId | No | Cancel and refund per policy — `400` if the refund would exceed the charge |

Roles recognized by `x-user-role`: `admin`, `staff`, `customer`. Missing or
unrecognized role returns `403`.

There's no separate login/signup endpoint — this was a deliberate scope
decision, not something missed. Every request just carries `x-user-role`
and `x-user-id` headers directly (see `src/middleware/auth.js`), which is
enough to exercise the actual authorization logic the assignment cares
about (the 404-not-403 rule) without building a real auth system on top
of it.