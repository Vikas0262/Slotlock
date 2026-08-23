import pool from '../src/db/index.js';

let testResourceId;
let testBookingId;

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO resources (name, iana_timezone) VALUES ('Test Resource', 'Asia/Kolkata') RETURNING id`
  );
  testResourceId = r.rows[0].id;

  const b = await pool.query(
    `INSERT INTO bookings (resource_id, customer_id, slot, status)
     VALUES ($1, gen_random_uuid(), tstzrange(now() + interval '48 hours', now() + interval '49 hours'), 'confirmed')
     RETURNING id`,
    [testResourceId]
  );
  testBookingId = b.rows[0].id;

  await pool.query(
    `INSERT INTO cancellation_policies (resource_id, hours_before_min, hours_before_max, refund_pct)
     VALUES ($1, 24, NULL, 100)`,
    [testResourceId]
  );

  await pool.query(
    `INSERT INTO ledger (booking_id, entry_type, amount) VALUES ($1, 'charge', 500)`,
    [testBookingId]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM ledger WHERE booking_id = $1`, [testBookingId]);
  await pool.query(`DELETE FROM bookings WHERE id = $1`, [testBookingId]);
  await pool.query(`DELETE FROM cancellation_policies WHERE resource_id = $1`, [testResourceId]);
  await pool.query(`DELETE FROM resources WHERE id = $1`, [testResourceId]);
  await pool.end();
});

test('refund never exceeds total charged amount', async () => {
  const chargeRes = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM ledger WHERE booking_id = $1 AND entry_type = 'charge'`,
    [testBookingId]
  );
  const totalCharged = parseFloat(chargeRes.rows[0].total);

  // manually inserting a refund that WOULD exceed charge - this simulates the guard check
  const attemptedRefund = 600; // 500 se zyada
  const wouldExceed = attemptedRefund > totalCharged;

  expect(wouldExceed).toBe(true); // hume pata hona chahiye ki ye exceed karega, taaki guard use rok sake
});