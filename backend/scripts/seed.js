import pool from '../src/db/index.js';

async function seed() {
  console.log('Seeding started...');

  
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

  // Slot grid: 3 resources x 90 days x 12 hours x 4 quarter-hour starts =
  // 12,960 distinct non-overlapping 30-min slots -- well above the ~5000
  // target, so the random-collision rate stays low all the way to 5000.
  // Whole-hour-only starts across an 8-hour window (the original version)
  // capped out at 3 x 90 x 8 = 2,160 possible slots -- collisions would
  // eventually dominate every attempt and the loop crawled toward
  // maxAttempts without ever reaching 5000.
  let inserted = 0;
  let attempts = 0;
  const maxAttempts = 50000;
  const BATCH_SIZE = 50;

  while (inserted < 5000 && attempts < maxAttempts) {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE && attempts < maxAttempts; i++) {
      attempts++;
      const resourceId = resourceIds[Math.floor(Math.random() * resourceIds.length)];
      const dayOffset = Math.floor(Math.random() * 90);
      const hour = 8 + Math.floor(Math.random() * 12);
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)];

      const start = new Date();
      start.setDate(start.getDate() + dayOffset);
      start.setHours(hour, minute, 0, 0);
      const end = new Date(start.getTime() + 30 * 60000);

      batch.push(
        pool.query(
          `INSERT INTO bookings (resource_id, customer_id, slot, status)
           VALUES ($1, gen_random_uuid(), tstzrange($2, $3, '[)'), 'confirmed')`,
          [resourceId, start.toISOString(), end.toISOString()]
        )
      );
    }

    const results = await Promise.allSettled(batch);
    inserted += results.filter((r) => r.status === 'fulfilled').length;

    if (attempts % 1000 === 0 || inserted >= 5000) {
      console.log(`  ...${inserted} inserted after ${attempts} attempts`);
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