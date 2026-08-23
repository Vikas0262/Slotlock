import { DateTime } from 'luxon';

export const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Mumbai (Asia/Kolkata)' },
  { value: 'America/New_York', label: 'New York (America/New_York)' },
  { value: 'UTC', label: 'UTC' },
];

// Monday 00:00 in `zone` that contains `anchor` (a Luxon DateTime in any zone).
export function startOfWeek(anchor, zone) {
  const local = anchor.setZone(zone);
  return local.startOf('week'); // luxon weeks start Monday
}

const SLOT_MINUTES = 30;

// Builds 7 day descriptors for the week starting at `weekStart` (a DateTime in `zone`).
// Each day's slot count is derived from the *actual* zoned duration between its
// local midnight and the next local midnight — 46 or 50 half-hour slots (23h/25h)
// on a DST-transition day, never assumed to be the usual 48.
export function buildWeekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayStart = weekStart.plus({ days: i }).startOf('day');
    const nextDayStart = dayStart.plus({ days: 1 }).startOf('day');
    const hourCount = Math.round(nextDayStart.diff(dayStart, 'hours').hours);
    const slotCount = Math.round(nextDayStart.diff(dayStart, 'minutes').minutes / SLOT_MINUTES);

    const slots = [];
    for (let s = 0; s < slotCount; s++) {
      slots.push(dayStart.plus({ minutes: s * SLOT_MINUTES }));
    }

    days.push({
      date: dayStart,
      label: dayStart.toFormat('ccc d LLL'),
      hourCount,
      slotCount,
      slots, // array of DateTime, one per actual local half-hour slot start
      isDstShort: hourCount < 24,
      isDstLong: hourCount > 24,
    });
  }
  return days;
}

export function maxSlotCount(days) {
  return days.reduce((max, d) => Math.max(max, d.slotCount), 0);
}

export { SLOT_MINUTES };

export function utcToZone(iso, zone) {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone);
}

export function fmtLocal(dt) {
  return dt.toFormat('HH:mm');
}
