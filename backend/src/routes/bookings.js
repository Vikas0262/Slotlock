import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { resource_id, customer_id, start_utc, end_utc } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO bookings (resource_id, customer_id, slot, status)
       VALUES ($1, $2, tstzrange($3, $4, '[)'), 'confirmed')
       RETURNING *`,
      [resource_id, customer_id, start_utc, end_utc]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Slot already booked' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM bookings ORDER BY created_at`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;