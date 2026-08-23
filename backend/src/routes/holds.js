import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { resource_id, customer_id, start_utc, end_utc } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO holds (resource_id, customer_id, slot, expires_at, status)
       VALUES ($1, $2, tstzrange($3, $4, '[)'), now() + interval '5 minutes', 'active')
       RETURNING *`,
      [resource_id, customer_id, start_utc, end_utc]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Slot already held or booked' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:holdId/confirm', async (req, res) => {
  const { holdId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const holdRes = await client.query(
      `SELECT * FROM holds WHERE id = $1 AND status = 'active' AND expires_at > now() FOR UPDATE`,
      [holdId]
    );

    if (holdRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'Hold expired or not found' });
    }

    const hold = holdRes.rows[0];

    const bookingRes = await client.query(
      `INSERT INTO bookings (resource_id, customer_id, slot, status)
       VALUES ($1, $2, $3, 'confirmed') RETURNING *`,
      [hold.resource_id, hold.customer_id, hold.slot]
    );

    await client.query(
      `UPDATE holds SET status = 'converted' WHERE id = $1`,
      [holdId]
    );

    await client.query('COMMIT');
    res.status(201).json(bookingRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Slot booked by someone else' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;