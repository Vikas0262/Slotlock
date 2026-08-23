import pool from '../src/db/index.js';

let testResourceId;

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO resources (name, iana_timezone) VALUES ('Concurrency Test Resource', 'Asia/Kolkata') RETURNING id`
  );
  testResourceId = r.rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM bookings WHERE resource_id = $1`, [testResourceId]);
  await pool.query(`DELETE FROM resources WHERE id = $1`, [testResourceId]);
  await pool.end();
});

test('overlapping bookings for the same resource are rejected at DB level', async () => {
  const start = '2027-01-01T04:00:00Z';
  const end = '2027-01-01T04:30:00Z';

  // Pehli booking successfully honi chahiye
  await pool.query(
    `INSERT INTO bookings (resource_id, customer_id, slot, status)
     VALUES ($1, gen_random_uuid(), tstzrange($2, $3, '[)'), 'confirmed')`,
    [testResourceId, start, end]
  );

  // Dusri overlapping booking REJECT honi chahiye
  await expect(
    pool.query(
      `INSERT INTO bookings (resource_id, customer_id, slot, status)
       VALUES ($1, gen_random_uuid(), tstzrange($2, $3, '[)'), 'confirmed')`,
      [testResourceId, start, end]
    )
  ).rejects.toThrow();
});