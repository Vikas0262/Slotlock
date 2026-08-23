import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

// Charge record karo (booking confirm hone ke turant baad call karna hai)
router.post('/charge', async (req, res) => {
  const { booking_id, amount } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO ledger (booking_id, entry_type, amount) VALUES ($1, 'charge', $2) RETURNING *`,
      [booking_id, amount]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Derived balance dekho (stored nahi, calculate hota hai)
router.get('/balance/:bookingId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS balance FROM ledger WHERE booking_id = $1`,
      [req.params.bookingId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cancel karo + policy ke hisaab se refund do
router.post('/cancel/:bookingId', async (req, res) => {
  const { bookingId } = req.params;
  try {
    const bookingRes = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    // slot ka start time nikalo range se
    const slotStartRes = await pool.query(
      `SELECT lower(slot) AS start_time FROM bookings WHERE id = $1`,
      [bookingId]
    );
    const startTime = new Date(slotStartRes.rows[0].start_time);
    const hoursBeforeStart = (startTime - new Date()) / 3600000;

    // policy dhoondo
    const policyRes = await pool.query(
      `SELECT * FROM cancellation_policies
       WHERE resource_id = $1
         AND $2 > hours_before_min
         AND ($2 <= hours_before_max OR hours_before_max IS NULL)`,
      [booking.resource_id, hoursBeforeStart]
    );
    const refundPct = policyRes.rows.length > 0 ? parseFloat(policyRes.rows[0].refund_pct) : 0;

    // ab tak total kitna charge hua aur refund hua, calculate karo
    const chargeRes = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM ledger WHERE booking_id = $1 AND entry_type = 'charge'`,
      [bookingId]
    );
    const refundedRes = await pool.query(
      `SELECT COALESCE(SUM(-amount),0) AS total FROM ledger WHERE booking_id = $1 AND entry_type = 'refund'`,
      [bookingId]
    );
    const totalCharged = parseFloat(chargeRes.rows[0].total);
    const totalRefunded = parseFloat(refundedRes.rows[0].total);
    const refundAmount = (totalCharged * refundPct) / 100;

    // GUARD: refund charge se zyada kabhi na ho
    if (totalRefunded + refundAmount > totalCharged) {
      return res.status(400).json({ error: 'Refund would exceed charged amount' });
    }

    await pool.query(
      `INSERT INTO ledger (booking_id, entry_type, amount) VALUES ($1, 'refund', $2)`,
      [bookingId, -refundAmount]
    );

    await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [bookingId]);

    res.json({ refunded: refundAmount, refund_pct: refundPct, hours_before_start: hoursBeforeStart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;