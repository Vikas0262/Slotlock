# TIME.md — Time Correctness

## Storage approach

- Instants (bookings, holds, blackouts, one-off availability) are stored in UTC
  using Postgres `TIMESTAMPTZ` / `TSTZRANGE` types.
- Each resource stores its own IANA timezone separately (`resources.iana_timezone`,
  e.g. `Asia/Kolkata`, `America/New_York`).
- Recurring availability rules are authored in **local wall-clock time**
  (`start_local_time`, `end_local_time` as `TIME`, plus `byday`) and resolved to
  UTC instants using the resource's timezone at query time.
- No naive local timestamps are stored anywhere. No hardcoded offsets
  (e.g. `+5:30`) are used — all conversions go through `luxon`.

## DST edge cases

### Spring forward (a local time that doesn't exist)

Tested `02:30` on `2026-03-08` in `America/New_York` — this is the date the
clock jumps from `02:00` directly to `03:00`, so `02:30` never actually occurs.

By default, `luxon`'s `DateTime.fromISO` silently rolls a nonexistent local
time forward instead of flagging it as invalid. To catch this, `inspectLocalTime`
does a round-trip check: convert the local time to UTC, then convert that UTC
instant back to the same zone, and compare it against the original input. If
they don't match, the original local time didn't really exist.

**Policy:** if a local time is detected as nonexistent (spring-forward gap),
the occurrence is **skipped** — no slot is generated for it. This is safer
than silently producing a shifted, incorrect time.

Actual test output:
```
Spring forward (02:30 on 2026-03-08, NY):
{
  isValid: false,
  invalidReason: 'local time does not exist (spring-forward gap)',
  utc: null,
  offset: null
}
```

### Fall back (a local time that occurs twice)

Tested `01:30` on `2026-11-01` in `America/New_York` — this is the date the
clock falls back from `02:00` to `01:00`, so `01:30` occurs twice: once in
EDT (daylight, offset -04:00) and once in EST (standard, offset -05:00).

**Policy:** the ambiguous local time is always resolved to the **first
occurrence** (the DST/EDT offset), which is `luxon`'s default resolution
behavior. This is applied consistently everywhere the code interprets a local
time, so the same wall-clock time always maps to the same UTC instant.

Actual test output:
```
Fall back (01:30 on 2026-11-01, NY):
{
  isValid: true,
  invalidReason: null,
  utc: '2026-11-01T05:30:00.000Z',
  offset: -240
}
```

### Normal case (non-DST timezone, for comparison)

```
Normal (09:00 on 2026-09-01, Kolkata):
{
  isValid: true,
  invalidReason: null,
  utc: '2026-09-01T03:30:00.000Z',
  offset: 330
}
```

India does not observe DST, so `Asia/Kolkata` has a fixed offset (+05:30)
year-round — no ambiguity or gaps ever occur for this zone.