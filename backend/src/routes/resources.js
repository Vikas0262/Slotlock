import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { name, iana_timezone } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO resources (name, iana_timezone) VALUES ($1, $2) RETURNING *`,
      [name, iana_timezone]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM resources ORDER BY created_at`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;