import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

router.post('/rules', async (req, res) => {
  const { resource_id, byday, start_local_time, end_local_time, effective_from, effective_until } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO availability_rules
       (resource_id, byday, start_local_time, end_local_time, effective_from, effective_until)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [resource_id, byday, start_local_time, end_local_time, effective_from, effective_until]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/free-slots/:resourceId', async (req, res) => {
  const { resourceId } = req.params;

  try {
    const query = `
      WITH days AS (
        SELECT generate_series(
          current_date, current_date + interval '30 days', interval '1 day'
        )::date AS day
      ),
      occurrences AS (
        SELECT
          ar.resource_id,
          (d.day + ar.start_local_time) AT TIME ZONE r.iana_timezone AS start_utc,
          (d.day + ar.end_local_time) AT TIME ZONE r.iana_timezone AS end_utc
        FROM days d
        JOIN availability_rules ar ON ar.resource_id = $1
        JOIN resources r ON r.id = ar.resource_id
        WHERE upper(to_char(d.day, 'DY')) = ar.byday
          AND d.day BETWEEN ar.effective_from AND ar.effective_until
      )
      SELECT o.start_utc, o.end_utc
      FROM occurrences o
      WHERE NOT EXISTS (
        SELECT 1 FROM bookings bk
        WHERE bk.resource_id = o.resource_id
          AND bk.status = 'confirmed'
          AND bk.slot && tstzrange(o.start_utc, o.end_utc)
      )
      AND NOT EXISTS (
        SELECT 1 FROM blackouts b
        WHERE b.resource_id = o.resource_id
          AND tstzrange(b.start_utc, b.end_utc) && tstzrange(o.start_utc, o.end_utc)
      )
      ORDER BY o.start_utc;
    `;

    const result = await pool.query(query, [resourceId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/blackouts', async (req, res) => {
  const { resource_id, start_utc, end_utc, reason } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO blackouts (resource_id, start_utc, end_utc, reason)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [resource_id, start_utc, end_utc, reason]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/one-off', async (req, res) => {
  const { resource_id, start_utc, end_utc } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO one_off_availability (resource_id, start_utc, end_utc)
       VALUES ($1,$2,$3) RETURNING *`,
      [resource_id, start_utc, end_utc]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
export default router;