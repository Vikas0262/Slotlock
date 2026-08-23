import pool from '../src/db/index.js';

async function seed() {
  console.log('Seeding started...');

  // 1. Resources - 2 alag timezones mein (ek DST wala, ek non-DST)
  const r1 = await pool.query(
    `INSERT INTO resources (name, iana_timezone) VALUES ('Dr. Rao', 'Asia/Kolkata') RETURNING id`
  );
  const r2 = await pool.query(
    `INSERT INTO resources (name, iana_timezone) VALUES ('Dr. Smith', 'America/New_York') RETURNING id`
  );
  const r3 = await pool.query(
    `INSERT INTO resources (name, iana_timezone) VALUES ('Room A', 'Asia/Kolkata') RETURNING id`
  );

  const resourceIds = [r1.rows[0].id, r2.rows[0].id, r3.rows[0].id];
  console.log('Created 3 resources:', resourceIds);

  // 2. Availability rules - Mon-Fri 09:00-17:00, agle 90 din
  for (const resourceId of resourceIds) {
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
      await pool.query(
        `INSERT INTO availability_rules
         (resource_id, byday, start_local_time, end_local_time, effective_from, effective_until)
         VALUES ($1, $2, '09:00', '17:00', current_date, current_date + interval '90 days')`,
        [resourceId, day]
      );
    }
  }
  console.log('Created availability rules for 90 days.');

  // 3. ~5000 random bookings - kuch collide bhi hongi (EXCLUDE constraint ki wajah se),
  // wo skip ho jayengi - ye khud proof hai ki system sahi kaam kar raha hai
  let inserted = 0;
  let attempts = 0;
  const maxAttempts = 20000;

  while (inserted < 5000 && attempts < maxAttempts) {
    attempts++;
    const resourceId = resourceIds[Math.floor(Math.random() * resourceIds.length)];
    const dayOffset = Math.floor(Math.random() * 90);
    const hour = 9 + Math.floor(Math.random() * 8); // 9 AM - 5 PM ke beech

    const start = new Date();
    start.setDate(start.getDate() + dayOffset);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000); // 30 min ki booking

    try {
      await pool.query(
        `INSERT INTO bookings (resource_id, customer_id, slot, status)
         VALUES ($1, gen_random_uuid(), tstzrange($2, $3, '[)'), 'confirmed')`,
        [resourceId, start.toISOString(), end.toISOString()]
      );
      inserted++;
    } catch (err) {
      // slot collision - expected with random data, skip and try again
    }
  }

  console.log(`Seeded ${inserted} bookings (out of ${attempts} attempts).`);
  console.log('Seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});