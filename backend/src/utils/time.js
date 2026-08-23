import { DateTime } from 'luxon';

export function localToUTC(dateStr, timeStr, zone) {
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone });
  return dt.toUTC().toISO();
}

export function inspectLocalTime(dateStr, timeStr, zone) {
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone });

  if (!dt.isValid) {
    return { isValid: false, invalidReason: dt.invalidReason, utc: null, offset: null };
  }

  const roundTrip = dt.toUTC().setZone(zone);
  const originalStr = `${dateStr}T${timeStr}`;
  const roundTripStr = roundTrip.toFormat("yyyy-MM-dd'T'HH:mm");

  const reallyValid = originalStr === roundTripStr;

  return {
    isValid: reallyValid,
    invalidReason: reallyValid ? null : 'local time does not exist (spring-forward gap)',
    utc: reallyValid ? dt.toUTC().toISO() : null,
    offset: reallyValid ? dt.offset : null
  };
}