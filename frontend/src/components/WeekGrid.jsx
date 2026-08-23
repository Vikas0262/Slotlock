import { useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import DayColumn from './DayColumn';
import { buildWeekDays, maxSlotCount, SLOT_MINUTES } from '../utils/weekGrid';

function toMinuteKey(dt) {
  return dt.toUTC().set({ second: 0, millisecond: 0 }).toISO();
}

export default function WeekGrid({ weekStart, freeSlots, bookedSlots, onSlotClick }) {
  const days = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const maxSlots = useMemo(() => maxSlotCount(days), [days]);

  const freeSet = useMemo(() => {
    const set = new Set();
    for (const s of freeSlots) {
      set.add(toMinuteKey_fromISO(s.start_utc));
    }
    return set;
  }, [freeSlots]);

  const bookedSet = useMemo(() => {
    const set = new Set();
    for (const b of bookedSlots) {
      set.add(toMinuteKey_fromISO(b.slot ? extractLower(b.slot) : b.start_utc));
    }
    return set;
  }, [bookedSlots]);

  // statusFor is stable across re-renders unless the underlying data changes,
  // so DayColumn/SlotCell memoization actually holds during hover/drag.
  const statusFor = useCallback(
    (slotStartLocal) => {
      const key = toMinuteKey(slotStartLocal);
      if (bookedSet.has(key)) return { status: 'booked', startUtc: slotStartLocal.toUTC().toISO() };
      if (freeSet.has(key)) return { status: 'free', startUtc: slotStartLocal.toUTC().toISO() };
      return { status: 'empty', startUtc: slotStartLocal.toUTC().toISO() };
    },
    [freeSet, bookedSet]
  );

  return (
    <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
      {days.map((day) => (
        <DayColumn
          key={day.date.toISO()}
          day={day}
          maxSlotCount={maxSlots}
          statusFor={statusFor}
          onSlotClick={(slotStart, info) => onSlotClick(slotStart, info, SLOT_MINUTES)}
        />
      ))}
    </Box>
  );
}

function toMinuteKey_fromISO(iso) {
  const d = new Date(iso);
  d.setSeconds(0, 0);
  return d.toISOString();
}

// bookings come back with a Postgres range literal string in `slot`
// (e.g. ["2026-09-01 04:00:00+00","2026-09-01 04:30:00+00")) when not
// otherwise projected — extract the lower bound so it maps to the same
// UTC-minute key used for free slots.
function extractLower(rangeStr) {
  const match = /\[?"?([^",)]+)/.exec(rangeStr);
  return match ? match[1] : rangeStr;
}
