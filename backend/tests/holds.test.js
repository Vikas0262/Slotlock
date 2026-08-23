import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/db/index.js';

let testResourceId;

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO resources (name, iana_timezone) VALUES ('Hold Expiry Test Resource', 'Asia/Kolkata') RETURNING id`
  );
  testResourceId = r.rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM bookings WHERE resource_id = $1`, [testResourceId]);
  await pool.query(`DELETE FROM holds WHERE resource_id = $1`, [testResourceId]);
  await pool.query(`DELETE FROM resources WHERE id = $1`, [testResourceId]);
  await pool.end();
});

test('an active, non-expired hold can be confirmed into a booking', async () => {
  const customerId = '11111111-1111-1111-1111-111111111111';
  const holdRes = await request(app).post('/holds').send({
    resource_id: testResourceId,
    customer_id: customerId,
    start_utc: '2027-02-01T04:00:00Z',
    end_utc: '2027-02-01T04:30:00Z',
  });
  expect(holdRes.status).toBe(201);

  const confirmRes = await request(app).post(`/holds/${holdRes.body.id}/confirm`);
  expect(confirmRes.status).toBe(201);
  expect(confirmRes.body.status).toBe('confirmed');
});

test('a hold whose expires_at has already passed cannot be confirmed (410), and the slot is bookable again', async () => {
  const customerId = '22222222-2222-2222-2222-222222222222';

  // Insert an already-expired hold directly, simulating the reaper not
  // having run yet — the confirm endpoint must catch this on its own via
  // the `expires_at > now()` check, independent of the background reaper.
  const holdRow = await pool.query(
    `INSERT INTO holds (resource_id, customer_id, slot, status, expires_at)
     VALUES ($1, $2, tstzrange($3, $4, '[)'), 'active', now() - interval '1 minute')
     RETURNING *`,
    [testResourceId, customerId, '2027-02-02T04:00:00Z', '2027-02-02T04:30:00Z']
  );

  const confirmRes = await request(app).post(`/holds/${holdRow.rows[0].id}/confirm`);
  expect(confirmRes.status).toBe(410);

  // Because the expired hold is stuck at status='active' until the reaper
  // (or this confirm attempt) flips it, a *new* hold is expected to still
  // conflict on the exact same slot until it's reaped — this is the
  // documented failure mode in CONCURRENCY.md, not a bug.
  const reHold = await request(app).post('/holds').send({
    resource_id: testResourceId,
    customer_id: customerId,
    start_utc: '2027-02-02T04:00:00Z',
    end_utc: '2027-02-02T04:30:00Z',
  });
  expect(reHold.status).toBe(409);

  // Once reaped, the slot is free again.
  await pool.query(`UPDATE holds SET status = 'expired' WHERE id = $1`, [holdRow.rows[0].id]);
  const reHoldAfterReap = await request(app).post('/holds').send({
    resource_id: testResourceId,
    customer_id: customerId,
    start_utc: '2027-02-02T04:00:00Z',
    end_utc: '2027-02-02T04:30:00Z',
  });
  expect(reHoldAfterReap.status).toBe(201);
});
