import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/db/index.js';

let testResourceId;
let testBookingId;

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO resources (name, iana_timezone) VALUES ('Ledger Test Resource', 'Asia/Kolkata') RETURNING id`
  );
  testResourceId = r.rows[0].id;

  const b = await pool.query(
    `INSERT INTO bookings (resource_id, customer_id, slot, status)
     VALUES ($1, gen_random_uuid(), tstzrange(now() + interval '48 hours', now() + interval '49 hours'), 'confirmed')
     RETURNING id`,
    [testResourceId]
  );
  testBookingId = b.rows[0].id;

  // >24h before start -> 100% refund, per the config-driven cancellation policy.
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

test('cancelling >24h out refunds via the config-driven policy, as a ledger entry', async () => {
  const res = await request(app).post(`/ledger/cancel/${testBookingId}`);
  expect(res.status).toBe(200);
  expect(res.body.refund_pct).toBe(100);
  expect(res.body.refunded).toBe(500);

  const ledgerRows = await pool.query(
    `SELECT * FROM ledger WHERE booking_id = $1 ORDER BY created_at`,
    [testBookingId]
  );
  expect(ledgerRows.rows).toHaveLength(2); // original charge + refund, both append-only
  expect(ledgerRows.rows[1].entry_type).toBe('refund');
});

test('a second cancel attempt is rejected by the route because the refund would exceed the charge', async () => {
  // The booking above was already fully refunded by the previous test.
  // Calling /ledger/cancel again must not let a second refund through.
  const res = await request(app).post(`/ledger/cancel/${testBookingId}`);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/exceed/i);

  const totalRefunded = await pool.query(
    `SELECT COALESCE(SUM(-amount),0) AS total FROM ledger WHERE booking_id = $1 AND entry_type = 'refund'`,
    [testBookingId]
  );
  expect(parseFloat(totalRefunded.rows[0].total)).toBe(500); // unchanged, still equals the original charge
});

test('cancelling a booking that does not exist returns 404', async () => {
  const res = await request(app).post('/ledger/cancel/00000000-0000-0000-0000-000000000000');
  expect(res.status).toBe(404);
});
