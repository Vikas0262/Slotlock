import express from 'express';
import pool from '../db/index.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();          

router.use(idempotencyMiddleware);         

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
  const { resource_id, from, to } = req.query;
  try {
    const conditions = [];
    const params = [];

    if (resource_id) {
      params.push(resource_id);
      conditions.push(`resource_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`upper(slot) > $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`lower(slot) < $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM bookings ${where} ORDER BY created_at`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireRole('admin', 'staff', 'customer'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const booking = result.rows[0];

    if (req.user.role === 'customer' && booking.customer_id !== req.user.id) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;