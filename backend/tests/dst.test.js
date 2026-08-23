import { inspectLocalTime } from '../src/utils/time.js';

test('spring forward - nonexistent local time detected as invalid', () => {
  const result = inspectLocalTime('2026-03-08', '02:30', 'America/New_York');
  expect(result.isValid).toBe(false);
});

test('fall back - ambiguous time resolves consistently to a UTC instant', () => {
  const result = inspectLocalTime('2026-11-01', '01:30', 'America/New_York');
  expect(result.isValid).toBe(true);
  expect(result.utc).toBe('2026-11-01T05:30:00.000Z');
});

test('normal case - non-DST zone always resolves cleanly', () => {
  const result = inspectLocalTime('2026-09-01', '09:00', 'Asia/Kolkata');
  expect(result.isValid).toBe(true);
  expect(result.utc).toBe('2026-09-01T03:30:00.000Z');
});